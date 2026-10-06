# Run AFTER test_registration_api.py (needs registered voters V001, V003; admin configured; ADMIN_PW env var).
#   ADMIN_PW="<your admin password>" python test_flow_api.py
import json, os, urllib.request, urllib.error, concurrent.futures as cf
D = json.load(open('imgs.json')); B = 'http://localhost:5000/api'
def call(m, p, body=None, tok=None):
    h = {'content-type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(B + p, json.dumps(body).encode() if body is not None else None, h, method=m)
    try: x = urllib.request.urlopen(r, timeout=60); return x.status, json.loads(x.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
ok = []
def t(n, c): ok.append(bool(c)); print('PASS' if c else 'FAIL', n)

st, b = call('POST', '/admin/login', {'username': 'admin', 'password': 'wrong'}); t('admin wrong password -> 401', st == 401)
st, b = call('POST', '/admin/login', {'username': 'admin', 'password': os.environ['ADMIN_PW']}); t('admin login', st == 200 and b.get('token')); A = b['token']
for p in ['/voters/all', '/votes/results', '/admin/blockchain', '/admin/audit-logs', '/admin/election', '/admin/candidates', '/admin/security']:
    t(f'{p}: 401 without token / 200 with', call('GET', p)[0] == 401 and call('GET', p, tok=A)[0] == 200)
t('admin candidate create needs token', call('POST', '/admin/candidates', {'name': 'X Y', 'party': 'P Q'})[0] == 401)

print('== election rules')
call('PUT', '/admin/election', {'status': 'DRAFT'}, A)
st, e = call('GET', '/votes/election'); t('election DRAFT -> closed', e['status'] == 'DRAFT' and e['open'] is False)
st, c = call('GET', '/votes/candidates'); t('candidates public, no vote_count', st == 200 and len(c) >= 2 and 'vote_count' not in c[0])
cid = c[0]['candidate_id']
st, b = call('POST', '/voters/authenticate', {'face_image': D['P1'][0], 'voter_id': 'V001'}); t('face of V003 with ID V001 -> 403 ID_MISMATCH', st == 403 and b.get('code') == 'ID_MISMATCH')
st, b = call('POST', '/voters/authenticate', {'face_image': D['P1'][0], 'voter_id': 'V003'}); t('right face + right ID -> session token', b.get('success') and b.get('session_token')); T3 = b['session_token']
st, b = call('POST', '/votes/cast', {'voter_id': 'V003', 'candidate_id': cid}); t('cast without session token -> 401', st == 401)
st, b = call('POST', '/votes/cast', {'voter_id': 'V003', 'candidate_id': cid}, tok='forged.token'); t('cast with forged token -> 401', st == 401)
st, b = call('POST', '/votes/cast', {'candidate_id': cid}, tok=T3); t('cast while DRAFT -> 403 "Voting is currently closed."', st == 403 and b.get('message') == 'Voting is currently closed.')
st, b = call('PUT', '/admin/election', {'status': 'SCHEDULED', 'start_time': None, 'end_time': None}, A); t('schedule without dates rejected', st == 400)
import datetime as dt
f = lambda h: (dt.datetime.utcnow() + dt.timedelta(hours=h)).strftime('%Y-%m-%dT%H:%M:%SZ')
st, b = call('PUT', '/admin/election', {'name': 'Test Election', 'status': 'SCHEDULED', 'start_time': f(1), 'end_time': f(2)}, A); t('schedule future window', st == 200 and b['election']['status'] == 'SCHEDULED')
st, b = call('POST', '/votes/cast', {'candidate_id': cid}, tok=T3); t('cast before start -> 403 closed', st == 403 and b.get('code') == 'VOTING_CLOSED')
st, b = call('PUT', '/admin/election', {'start_time': f(2), 'end_time': f(1)}, A); t('end before start rejected', st == 400)
st, b = call('POST', '/admin/election/open-now', {'hours': 1}, A); t('open now -> ACTIVE', st == 200 and b['election']['status'] == 'ACTIVE')

print('== candidates')
st, b = call('POST', '/admin/candidates', {'name': 'A', 'party': ''}, A); t('invalid candidate rejected (400)', st == 400)
call('PUT', '/admin/election', {'status': 'DRAFT'}, A)
st, b = call('POST', '/admin/candidates', {'name': 'Candidate D', 'party': 'Party Delta', 'symbol': '🔷', 'description': 'Test candidate'}, A); t('add candidate (election not active)', st == 201); nid = b.get('candidate_id')
st, b = call('PUT', f'/admin/candidates/{nid}', {'name': 'Candidate D2', 'party': 'Party Delta', 'symbol': '🔷'}, A); t('edit candidate', st == 200)
st, b = call('POST', f'/admin/candidates/{nid}/active', {'active': False}, A); t('deactivate candidate', st == 200)
t('inactive candidate hidden from voters', nid not in [x['candidate_id'] for x in call('GET', '/votes/candidates')[1]])
call('POST', '/admin/election/open-now', {'hours': 1}, A)
st, b = call('POST', '/admin/candidates', {'name': 'Late One', 'party': 'Late Party'}, A); t('add candidate while ACTIVE -> 409 locked', st == 409 and b.get('code') == 'ELECTION_LOCKED')
st, b = call('POST', '/votes/cast', {'candidate_id': nid}, tok=T3); t('vote for inactive candidate rejected', st == 404)

print('== voting (election ACTIVE)')
with cf.ThreadPoolExecutor(8) as ex:
    rs = list(ex.map(lambda _: call('POST', '/votes/cast', {'voter_id': 'V001', 'candidate_id': cid}, tok=T3)[1], range(8)))
t('8 parallel casts -> exactly 1 success', sum(1 for r in rs if r.get('success')) == 1)
st, b = call('POST', '/votes/cast', {'candidate_id': cid}, tok=T3); t('second vote rejected 409', st == 409)
st, b = call('POST', '/voters/authenticate', {'face_image': D['P1'][0]}); t('voted voter cannot authenticate again', not b.get('success') and b.get('already_voted'))
st, r = call('GET', '/votes/results', tok=A)
t('results: total_votes == 1 == sum(vote_count)', r['total_votes'] == 1 and sum(x['vote_count'] for x in r['candidates']) == 1)
st, bc = call('GET', '/admin/blockchain', tok=A); t('blockchain valid, 1 vote block (+genesis)', bc.get('is_valid') and bc.get('total_blocks') == 2)
t('blockchain blocks do not contain raw voter id', 'V003' not in json.dumps(bc))
st, logs = call('GET', '/admin/audit-logs', tok=A)
t('audit log has no candidate next to voter', not any('Candidate' in x['action'] for x in logs) and any(x['action'] == 'VOTED' for x in logs))
t('audit log records admin actions', any(x.get('actor') == 'admin' for x in logs))
call('POST', '/admin/election/close', None, A)
st, e = call('GET', '/votes/election'); t('election closed -> ENDED', e['status'] == 'ENDED' and not e['open'])
print('ALL', sum(ok), '/', len(ok))
