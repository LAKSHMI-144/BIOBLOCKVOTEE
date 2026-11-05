# End-to-end API test: geography -> parties -> candidates -> voter registration (with constituency) -> face login
# -> per-constituency ballot -> voting rules -> results/dashboard/audit/blockchain.
#
#   ADMIN_PW="<admin password>" python test_election_flow.py
#   (optional) DB_PASSWORD=... DB_USER=root DB_NAME=securevoteai   -> also runs the "ineligible voter" check
#
# Needs MySQL/MariaDB + Python AI + Node running and an EMPTY scratch voters table. Do not run it on the same data as
# test_registration_api.py (both register the same sample faces); reset the scratch DB in between (see README.md).
# imgs.json contains still photos only. Login now requires a live randomized camera challenge, so this script cannot
# execute its voter-session/voting section; run that part manually through the browser with a webcam.
import json, os, sys, urllib.request, urllib.error, concurrent.futures as cf, datetime as dt
D = json.load(open('imgs.json')); B = 'http://localhost:5000/api'
def call(m, p, body=None, tok=None):
    h = {'content-type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(B + p, json.dumps(body).encode() if body is not None else None, h, method=m)
    try: x = urllib.request.urlopen(r, timeout=90); return x.status, json.loads(x.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
ok = []
def t(n, c, extra=''):
    ok.append(bool(c)); print('PASS' if c else 'FAIL', n, '' if c else f'  <-- {extra}')

st, b = call('POST', '/admin/login', {'username': 'admin', 'password': 'wrong'}); t('admin wrong password -> 401', st == 401)
st, b = call('POST', '/admin/login', {'username': 'admin', 'password': os.environ['ADMIN_PW']}); t('admin login', st == 200 and b.get('token')); A = b['token']

print('== admin endpoints refuse requests without a token')
for m, p in [('GET', '/admin/dashboard-stats'), ('GET', '/admin/parties'), ('POST', '/admin/parties'), ('GET', '/admin/candidates'), ('POST', '/admin/candidates'),
             ('PUT', '/admin/candidates/1'), ('POST', '/admin/candidates/1/active'), ('GET', '/admin/constituencies'), ('POST', '/admin/constituencies'),
             ('GET', '/admin/audit-logs'), ('PUT', '/admin/voters/X/constituency'), ('GET', '/admin/blockchain'), ('GET', '/votes/results'), ('GET', '/voters/all')]:
    t(f'{m} {p}: 401 without token', call(m, p, {} if m != 'GET' else None)[0] == 401)
t('forged admin token -> 401', call('GET', '/admin/parties', tok='x.y')[0] == 401)

print('== geography master data')
st, states = call('GET', '/geo/states'); t('36 states/UTs (28 + 8)', st == 200 and len(states) == 36 and sum(s['kind'] == 'STATE' for s in states) == 28 and sum(s['kind'] == 'UT' for s in states) == 8)
S = {s['code']: s['state_id'] for s in states}
t('no invented 29th state', 'Telangana' in [s['name'] for s in states] and len({s['name'] for s in states}) == 36)
st, ka = call('GET', f'/geo/constituencies?state_id={S["KA"]}'); t('Karnataka has 28 parliamentary constituencies', st == 200 and len(ka) == 28)
HASSAN = next(c['constituency_id'] for c in ka if c['name'] == 'Hassan'); MYSORE = next(c['constituency_id'] for c in ka if c['name'] == 'Mysore')
t('constituencies need state_id', call('GET', '/geo/constituencies')[0] == 400)
st, b = call('POST', '/admin/constituencies', {'state_id': S['KL'], 'name': 'Demo Kerala Constituency'}, A); t('add constituency (Kerala)', st == 201); KERALA = b.get('constituency_id')
t('duplicate constituency -> 409', call('POST', '/admin/constituencies', {'state_id': S['KL'], 'name': 'Demo Kerala Constituency'}, A)[0] == 409)
t('constituency without state -> 400', call('POST', '/admin/constituencies', {'name': 'Nowhere'}, A)[0] == 400)

print('== parties')
st, parties = call('GET', '/admin/parties', tok=A); P = {p['abbreviation']: p for p in parties}
t('BJP and INC contest in every state', P['BJP']['all_states'] and P['INC']['all_states'])
t('JD(S) linked to Karnataka only', P['JD(S)']['state_ids'] == [S['KA']] and not P['JD(S)']['all_states'])
t('DMK linked to Tamil Nadu/Puducherry, not Karnataka', S['KA'] not in P['DMK']['state_ids'] and S['TN'] in P['DMK']['state_ids'])
st, ps = call('GET', f'/admin/parties?state_id={S["KA"]}', tok=A); ab = {p['abbreviation'] for p in ps}
t('state filter: Karnataka -> BJP, INC, JD(S); not DMK', {'BJP', 'INC', 'JD(S)'} <= ab and 'DMK' not in ab)
t('duplicate party name -> 409', call('POST', '/admin/parties', {'name': 'Bharatiya Janata Party', 'abbreviation': 'BJPX', 'all_states': True}, A)[0] == 409)
t('duplicate abbreviation -> 409', call('POST', '/admin/parties', {'name': 'Another Party', 'abbreviation': 'INC', 'all_states': True}, A)[0] == 409)
t('party needs states or all_states -> 400', call('POST', '/admin/parties', {'name': 'Demo Party', 'abbreviation': 'DEMO'}, A)[0] == 400)
st, b = call('POST', '/admin/parties', {'name': 'Demo Kerala Party', 'abbreviation': 'DKP', 'state_ids': [S['KL']], 'notes': 'test data'}, A); t('add party', st == 201); DKP = b.get('party_id')
st, b = call('PUT', f'/admin/parties/{DKP}', {'name': 'Demo Kerala Party', 'abbreviation': 'DKP', 'state_ids': [S['KL'], S['KA']], 'notes': 'edited'}, A); t('edit party (add Karnataka)', st == 200)
st, ps = call('GET', f'/admin/parties?state_id={S["KA"]}', tok=A); t('edited party now offered in Karnataka', 'DKP' in {p['abbreviation'] for p in ps})
t('deactivate party', call('POST', f'/admin/parties/{DKP}/active', {'active': False}, A)[0] == 200)
t('unknown party -> 404', call('POST', '/admin/parties/99999/active', {'active': True}, A)[0] == 404)

print('== election + candidates (every name below is a clearly labelled DEMO candidate)')
call('PUT', '/admin/election', {'name': 'Lok Sabha Election Simulation (Demo)', 'status': 'DRAFT', 'election_type': 'PARLIAMENTARY'}, A)
st, el = call('GET', '/admin/election', tok=A); t('election is a parliamentary SIMULATION, DRAFT', el['election_type'] == 'PARLIAMENTARY' and el['status'] == 'DRAFT' and 'Simulation' in el['name'])
def cand(name, party, cons, **kw): return call('POST', '/admin/candidates', {'name': name, 'party_id': P[party]['party_id'] if isinstance(party, str) else party, 'constituency_id': cons, **kw}, A)
st, b = cand('Demo Candidate 1', 'BJP', HASSAN, position='Member of Parliament (demo)'); t('add BJP candidate in Hassan', st == 201); C1 = b.get('candidate_id')
st, b = cand('Demo Candidate 2', 'INC', HASSAN); t('add INC candidate in Hassan', st == 201); C2 = b.get('candidate_id')
st, b = cand('Demo Candidate 3', 'INC', HASSAN); t('second INC candidate in same constituency -> 409', st == 400 and b.get('code') == 'PARTY_ALREADY_FIELDED', b)
st, b = cand('Demo Candidate 5', 'JD(S)', HASSAN); t('add JD(S) candidate in Hassan', st == 201); C5 = b.get('candidate_id')
st, b = cand('Demo Candidate X', 'DMK', HASSAN); t('DMK in Karnataka rejected (PARTY_NOT_IN_STATE)', st == 400 and b.get('code') == 'PARTY_NOT_IN_STATE', b)
st, b = cand('Demo Candidate Y', DKP, HASSAN); t('inactive party rejected', st == 400 and b.get('code') == 'PARTY_INACTIVE', b)
call('POST', f'/admin/parties/{DKP}/active', {'active': True}, A)
st, b = cand('Demo Independent 1', 'IND', HASSAN); t('independent #1', st == 201); I1 = b.get('candidate_id')
st, b = cand('Demo Independent 2', 'IND', HASSAN); t('independent #2 allowed', st == 201)
st, b = cand('Demo Independent 2', 'IND', HASSAN); t('same name twice in a constituency -> 409', st == 409)
st, b = cand('Demo Candidate 4', 'BJP', MYSORE); t('add BJP candidate in Mysore', st == 201); C4 = b.get('candidate_id')
st, b = cand('Demo Candidate 6', 'BJP', KERALA); t('add BJP candidate in Kerala', st == 201)
st, b = cand('Demo Candidate Z', 'BJP', 999999); t('unknown constituency -> 400', st == 400)
st, b = call('POST', '/admin/candidates', {'name': 'D', 'party_id': P['BJP']['party_id'], 'constituency_id': HASSAN}, A); t('short name -> 400', st == 400)
st, b = call('POST', '/admin/candidates', {'name': 'Demo Candidate Q'}, A); t('missing party/constituency -> 400', st == 400)
st, l = call('GET', f'/admin/candidates?constituency_id={HASSAN}', tok=A); t('filter by constituency (Hassan: 5 incl. independents)', st == 200 and len(l) == 5, len(l))
st, l = call('GET', f'/admin/candidates?party_id={P["BJP"]["party_id"]}', tok=A); t('filter by party (BJP: 3)', len(l) == 3)
st, l = call('GET', f'/admin/candidates?state_id={S["KL"]}', tok=A); t('filter by state (Kerala: 1)', len(l) == 1)
st, l = call('GET', '/admin/candidates?q=Candidate%204', tok=A); t('search by name', len(l) == 1 and l[0]['candidate_id'] == C4)
t('candidate rows carry party + constituency + state names', all(x['party_abbr'] and x['constituency_name'] and x['state_name'] for x in call('GET', '/admin/candidates?q=Demo', tok=A)[1]))
st, b = call('PUT', f'/admin/candidates/{C1}', {'name': 'Demo Candidate 1', 'party_id': P['BJP']['party_id'], 'constituency_id': HASSAN, 'description': 'edited', 'position': 'MP (demo)'}, A); t('edit candidate (no votes yet)', st == 200)
st, b = call('GET', f'/admin/candidates/{C1}', tok=A); t('edit persisted', b.get('description') == 'edited')
st, b = call('PUT', '/admin/election', {'election_type': 'ASSEMBLY'}, A); t('election type locked once candidates exist', st == 400 and b.get('code') == 'TYPE_LOCKED', b)

print('== voters: registration with constituency, face login')
IDV = '/identity'
def register(vid, name, imgs, cons=None):
    body = dict(voter_id=vid, name=name, age=30, gender='Male', address='Demo address, Karnataka')
    if cons: body.update(state_id=S['KA'], constituency_id=cons)
    st, b = call('POST', '/voters/register', body); assert st == 200, b; tok = b['registration_token']
    call('POST', f'{IDV}/start', {'contact': '9876543210'}, tok); call('POST', f'{IDV}/send-otp', {'contact': '9876543210'}, tok)
    call('POST', f'{IDV}/verify-otp', {'contact': '9876543210', 'otp': '123456'}, tok)
    return call('POST', '/voters/register-face', {'images': imgs[:3]}, tok)
st, b = call('POST', '/voters/register', dict(voter_id='ELEC900', name='Bad Location', age=30, gender='Male', address='Demo address, Karnataka', state_id=S['KA'], constituency_id=KERALA)); t('constituency from another state rejected at registration', st == 400, b)
st, b = register('ELEC001', 'Demo Voter One', D['P3'], HASSAN); t('register voter in Hassan (face, OTP, constituency)', st == 200 and b.get('success'), b)
st, b = register('ELEC002', 'Demo Voter Two', D['P5'], MYSORE); t('register voter in Mysore', st == 200 and b.get('success'), b)
st, b = register('ELEC003', 'Demo Voter Three', D['P0']); t('register voter WITHOUT constituency', st == 200 and b.get('success'), b)
st, vs = call('GET', '/voters/all', tok=A); V = {v['voter_id']: v for v in vs}
t('/voters/all shows constituency names (no embeddings)', V['ELEC001']['constituency_name'] == 'Hassan' and V['ELEC003']['constituency_name'] is None and 'face_encoding' not in V['ELEC001'])
st, b = call('POST', '/voters/authenticate', {'face_image': D['P3'][3], 'voter_id': 'ELEC001'})
t('single still image cannot issue a voter session', st == 400 and b.get('code') == 'INVALID_LIVENESS_DATA')
if not all(ok):
    raise SystemExit(1)
print('SKIP voter-session and voting-flow checks: imgs.json contains still images only; use a live webcam for the challenge.')
raise SystemExit(0)

print('== ballot is built on the server from the voter\'s constituency')
t('candidate list needs a voter session', call('GET', '/votes/candidates')[0] == 401 and call('GET', '/votes/candidates', tok='forged.token')[0] == 401)
st, b1 = call('GET', '/votes/candidates', tok=T1); names1 = sorted(c['name'] for c in b1.get('candidates', []))
t('Hassan ballot = exactly the 5 active Hassan candidates', names1 == sorted(['Demo Candidate 1', 'Demo Candidate 2', 'Demo Candidate 5', 'Demo Independent 1', 'Demo Independent 2']), names1)
t('ballot shows party, no vote counts, no other constituencies', all('party' in c and 'vote_count' not in c and 'votes' not in c for c in b1['candidates']) and b1['constituency']['name'] == 'Hassan')
st, b2 = call('GET', '/votes/candidates', tok=T2); t('Mysore ballot = only the Mysore candidate', [c['name'] for c in b2['candidates']] == ['Demo Candidate 4'])
st, b3 = call('GET', '/votes/candidates', tok=T3); t('voter without constituency -> 409 NO_CONSTITUENCY (no wrong list)', st == 409 and b3.get('code') == 'NO_CONSTITUENCY' and 'candidates' not in b3)
t('deactivate candidate', call('POST', f'/admin/candidates/{C2}/active', {'active': False}, A)[0] == 200)
st, b1 = call('GET', '/votes/candidates', tok=T1); t('deactivated candidate disappears from the ballot', 'Demo Candidate 2' not in [c['name'] for c in b1['candidates']])
st, b = call('POST', f'/admin/candidates/{C5}/active', {'active': True}, A); t('activate again is idempotent', st == 200)
st, b = call('PUT', '/admin/voters/ELEC003/constituency', {'constituency_id': MYSORE}, A); t('admin assigns constituency to voter 3', st == 200)
st, b3 = call('GET', '/votes/candidates', tok=T3); t('voter 3 now sees the Mysore ballot', st == 200 and [c['name'] for c in b3['candidates']] == ['Demo Candidate 4'])
t('assign unknown constituency -> 404', call('PUT', '/admin/voters/ELEC003/constituency', {'constituency_id': 99999}, A)[0] == 404)

print('== voting rules')
t('cast while election is DRAFT -> 403 closed', call('POST', '/votes/cast', {'candidate_id': C1}, tok=T1)[1].get('code') == 'VOTING_CLOSED')
t('cast without session -> 401', call('POST', '/votes/cast', {'candidate_id': C1})[0] == 401)
t('cast with forged token -> 401', call('POST', '/votes/cast', {'candidate_id': C1}, tok='forged.token')[0] == 401)
st, b = call('POST', '/admin/election/open-now', {'hours': 1}, A); t('open election (ACTIVE)', st == 200 and b['election']['status'] == 'ACTIVE')
st, b = call('POST', '/admin/candidates', {'name': 'Late Demo', 'party_id': P['BJP']['party_id'], 'constituency_id': KERALA}, A); t('cannot add candidates while ACTIVE', st == 409 and b.get('code') == 'ELECTION_LOCKED')
st, b = call('POST', '/votes/cast', {'candidate_id': C4}, tok=T1); t('Hassan voter cannot vote for a Mysore candidate (server-side check)', st == 404 and b.get('code') == 'CANDIDATE_INVALID', b)
st, b = call('POST', '/votes/cast', {'candidate_id': C2}, tok=T1); t('cannot vote for a deactivated candidate', st == 404 and b.get('code') == 'CANDIDATE_INVALID', b)
st, b = call('POST', '/votes/cast', {'candidate_id': 999999}, tok=T1); t('unknown candidate -> 404', st == 404)
st, b = call('POST', '/votes/cast', {'candidate_id': 'abc'}, tok=T1); t('non-numeric candidate -> 400', st == 400)
with cf.ThreadPoolExecutor(8) as ex: rs = list(ex.map(lambda _: call('POST', '/votes/cast', {'candidate_id': C1}, tok=T1)[1], range(8)))
t('8 parallel casts by one voter -> exactly 1 success', sum(1 for r in rs if r.get('success')) == 1, rs)
t('the 7 others are ALREADY_VOTED / rejected', sum(1 for r in rs if r.get('code') == 'ALREADY_VOTED') == 7)
st, b = call('POST', '/votes/cast', {'candidate_id': C1}, tok=T1); t('second vote rejected 409', st == 409)
st, b = call('POST', '/voters/authenticate', {'face_image': D['P3'][1]}); t('voter who voted cannot log in again', not b.get('success') and b.get('already_voted'))
st, b = call('POST', '/votes/cast', {'candidate_id': C4}, tok=T2); t('Mysore voter votes for Mysore candidate', st == 200 and b.get('success'), b); BLOCK2 = b.get('block_hash')
if os.environ.get('DB_PASSWORD'):
    import mysql.connector
    cx = mysql.connector.connect(host=os.environ.get('DB_HOST', 'localhost'), user=os.environ.get('DB_USER', 'root'), password=os.environ['DB_PASSWORD'], database=os.environ.get('DB_NAME', 'securevoteai'))
    cu = cx.cursor(); cu.execute("UPDATE voters SET is_eligible = FALSE WHERE voter_id = 'ELEC003'"); cx.commit()
    st, b = call('POST', '/votes/cast', {'candidate_id': C4}, tok=T3); t('ineligible voter cannot vote (NOT_ELIGIBLE)', st == 403 and b.get('code') == 'NOT_ELIGIBLE', b)
    cu.execute("UPDATE voters SET is_eligible = TRUE WHERE voter_id = 'ELEC003'"); cx.commit(); cx.close()
else: print('SKIP  ineligible voter check (set DB_PASSWORD to run it)')
st, b = call('POST', '/votes/cast', {'candidate_id': C4}, tok=T3); t('voter 3 (reassigned to Mysore) can vote', st == 200 and b.get('success'), b)

print('== votes cast: candidates with votes keep their identity')
call('PUT', '/admin/election', {'status': 'DRAFT'}, A)
st, b = call('PUT', f'/admin/candidates/{C1}', {'name': 'Renamed After Votes', 'party_id': P['BJP']['party_id'], 'constituency_id': HASSAN}, A); t('rename of a candidate with votes -> 409 IDENTITY_LOCKED', st == 409 and b.get('code') == 'IDENTITY_LOCKED', b)
st, b = call('PUT', f'/admin/candidates/{C1}', {'name': 'Demo Candidate 1', 'party_id': P['INC']['party_id'], 'constituency_id': HASSAN}, A); t('changing party of a candidate with votes -> 409', st == 409 and b.get('code') == 'IDENTITY_LOCKED')
st, b = call('PUT', f'/admin/candidates/{C1}', {'name': 'Demo Candidate 1', 'party_id': P['BJP']['party_id'], 'constituency_id': HASSAN, 'description': 'still editable'}, A); t('description of a candidate with votes can change', st == 200)
t('a candidate with votes can be deactivated (history kept)', call('POST', f'/admin/candidates/{C1}/active', {'active': False}, A)[0] == 200)
st, r = call('GET', '/votes/results', tok=A); t('deactivated candidate keeps its votes in results', any(c['candidate_id'] == C1 and c['votes'] == 1 for c in r['candidates']))
call('POST', f'/admin/candidates/{C1}/active', {'active': True}, A)

print('== results, dashboard, audit, blockchain')
st, r = call('GET', '/votes/results', tok=A)
t('results: total = 3 = sum of candidate votes', r['total_votes'] == 3 and sum(c['votes'] for c in r['candidates']) == 3, r['total_votes'])
c4 = next(c for c in r['candidates'] if c['candidate_id'] == C4); t('Mysore candidate: 2 votes, 66.7%', c4['votes'] == 2 and c4['percent'] == 66.7, c4)
t('results carry party and have no voter ids', all('party_abbr' in c for c in r['candidates']) and 'ELEC00' not in json.dumps(r))
t('by_party aggregates BJP', next(p for p in r['by_party'] if p['party'] == 'BJP')['votes'] == 3)
st, d = call('GET', '/admin/dashboard-stats', tok=A)
t('dashboard totals match results', d['votes']['total'] == r['total_votes'] and d['votes']['consistent'] and d['voters']['voted'] == 3)
t('dashboard: voters counted from the database', d['voters']['registered'] >= 3 and d['voters']['eligible'] >= 3 and d['voters']['remaining_eligible'] == d['voters']['eligible'] - d['voters']['voted'])
t('dashboard: turnout = voted / eligible', abs(d['voters']['turnout_percent'] - round(d['voters']['voted'] / d['voters']['eligible'] * 100, 1)) < 0.11)
t('dashboard: election status is real (DRAFT now)', d['election']['status'] == 'DRAFT' and d['election']['type'] == 'PARLIAMENTARY')
t('dashboard: blockchain valid with 3 vote blocks', d['blockchain'].get('available') and d['blockchain']['is_valid'] and d['blockchain']['vote_blocks'] == 3, d['blockchain'])
t('dashboard recent activity never names a candidate or a face', len(d['recent_activity']) > 0 and 'Demo Candidate' not in json.dumps(d['recent_activity']))
st, bc = call('GET', '/admin/blockchain', tok=A)
t('blockchain page data: valid, hashes linked, no candidate, no raw voter id', bc['is_valid'] and bc['total_blocks'] == 4 and all('candidate' not in b for b in bc['chain']) and 'ELEC00' not in json.dumps(bc))
t('each vote block has a vote reference and previous hash', all(b['vote_reference'] and b['prev_hash'] for b in bc['chain'][1:]))
st, L = call('GET', '/admin/audit-logs', tok=A)
t('audit: paged response with summary', st == 200 and 'rows' in L and L['summary']['total'] == L['total'] and L['page'] == 1)
t('audit rows carry id, event, user, role, time, status', all({'id', 'event_type', 'user_id', 'role', 'timestamp', 'status', 'details'} <= set(x) for x in L['rows']))
t('audit never contains a candidate name or choice', 'Demo Candidate' not in json.dumps(L['rows']) and 'VOTED_FOR' not in json.dumps(L['rows']))
st, v = call('GET', '/admin/audit-logs?event=VOTED&page_size=100', tok=A); t('audit filter by event (3 votes)', v['total'] == 3 and all(x['event_type'] == 'VOTED' and x['user_id'].startswith('ELEC') for x in v['rows']))
st, v = call('GET', '/admin/audit-logs?status=DENIED&page_size=100', tok=A); t('audit filter by status: duplicate / closed attempts are DENIED', v['total'] >= 8 and any(x['event_type'] == 'DUPLICATE_ATTEMPT' for x in v['rows']), v['total'])
st, v = call('GET', '/admin/audit-logs?status=FAILED&page_size=100', tok=A); t('failed events recorded (admin login, face auth)', any(x['event_type'] == 'ADMIN_LOGIN_FAILED' for x in v['rows']) and any(x['event_type'] == 'AUTH_FAILED' for x in v['rows']), [x['event_type'] for x in v['rows']])
st, v = call('GET', '/admin/audit-logs?role=admin&page_size=100', tok=A); t('audit filter by role (admin actions)', v['total'] >= 10 and all(x['role'] == 'admin' for x in v['rows']) and any(x['event_type'] == 'CANDIDATE_ADDED' for x in v['rows']))
st, v = call('GET', '/admin/audit-logs?q=ELEC001&page_size=100', tok=A); t('audit search by user id', v['total'] >= 3 and all('ELEC001' in x['user_id'] for x in v['rows']))
st, v = call('GET', f'/admin/audit-logs?from={dt.date.today()}&to={dt.date.today()}&page_size=100', tok=A); t('audit date-range filter (today)', v['total'] > 0)
st, v = call('GET', '/admin/audit-logs?to=2000-01-01', tok=A); t('audit date-range filter (past) -> empty', v['total'] == 0 and v['rows'] == [])
st, v = call('GET', '/admin/audit-logs?page_size=5&page=2', tok=A); t('audit pagination', v['page'] == 2 and len(v['rows']) == 5 and v['pages'] >= 2)
st, v = call('GET', "/admin/audit-logs?q=%27%20OR%201%3D1%20--", tok=A); t('audit search is injection-safe', st == 200 and v['total'] == 0)
t('audit event types listed for the filter', 'VOTED' in L['event_types'] and 'CANDIDATE_ADDED' in L['event_types'])
call('POST', '/admin/election/close', None, A)
st, e = call('GET', '/votes/election'); t('election closed -> ENDED', e['status'] == 'ENDED' and not e['open'])
st, b = call('POST', f'/admin/candidates/{C2}/active', {'active': True}, A); t('no candidate status change after the election ended', st == 409)
print(f'\nALL {sum(ok)} / {len(ok)}')
sys.exit(0 if all(ok) else 1)
