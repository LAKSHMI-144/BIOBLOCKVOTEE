import json, urllib.request, urllib.error
D = json.load(open('imgs.json'))
API = 'http://localhost:5000/api/voters'
def call(path, body):
    req = urllib.request.Request(API+path, json.dumps(body).encode(), {'content-type':'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=60); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
res=[]
def t(name, got, expect_status=None, expect_code=None, expect_success=None, expect_msg=None):
    st, b = got
    ok = ((expect_status is None or st==expect_status) and (expect_code is None or b.get('code')==expect_code)
          and (expect_success is None or b.get('success')==expect_success) and (expect_msg is None or expect_msg in b.get('message','')))
    res.append(ok); print(('PASS' if ok else 'FAIL'), f'{name:52s}', st, b.get('code',''), '|', b.get('message',''))
ok_details = dict(voter_id='V001', name='Asha Rao', age=25, gender='Female', address='Hassan')
print("== Step 1: details validation")
t('bad voter id',            call('/register', {**ok_details,'voter_id':'a b!'}), 400)
t('missing name',            call('/register', {**ok_details,'name':' '}), 400)
t('age not a number',        call('/register', {**ok_details,'age':'abc'}), 400)
t('underage (17)',           call('/register', {**ok_details,'age':17}), 400, expect_msg='18')
t('SQL-injection-ish id',    call('/register', {**ok_details,'voter_id':"V1'; DROP TABLE voters;--"}), 400)
t('valid details (V001)',    call('/register', ok_details), 200, expect_success=True)
t('duplicate details? (no face yet -> resume)', call('/register', ok_details), 200, expect_success=True)
print("== Step 2: face capture rejections (each must give a DIFFERENT specific reason)")
for k,code in [('noise','NO_FACE'),('blank','NO_FACE'),('multi','MULTIPLE_FACES'),('blurry','TOO_BLURRY'),('dark','TOO_DARK'),('tiny','FACE_TOO_SMALL'),('garbage','INVALID_IMAGE')]:
    t(f'check-face: {k}', call('/check-face', {'image':D[k]}), 400, code)
t('check-face: good face', call('/check-face', {'image':D['P0'][0]}), 200, expect_success=True)
print("== Step 2: template registration")
A=D['P0']
t('too few images (2)',      call('/register-face', {'voter_id':'V001','images':A[:2]}), 400)
t('3 identical frames',      call('/register-face', {'voter_id':'V001','images':[A[0]]*3}), 400, 'DUPLICATE_FRAMES')
t('one bad image in set',    call('/register-face', {'voter_id':'V001','images':[A[0],A[1],D['multi']]}), 400, 'MULTIPLE_FACES')
t('two different people',    call('/register-face', {'voter_id':'V001','images':[A[0],A[1],D['P1'][0]]}), 400, 'INCONSISTENT_FACES')
t('unknown voter',           call('/register-face', {'voter_id':'NOPE1','images':A[:3]}), 404)
t('valid face V001 (person 0)', call('/register-face', {'voter_id':'V001','images':A[:3]}), 200, expect_success=True)
t('V001 face again -> conflict', call('/register-face', {'voter_id':'V001','images':A[:3]}), 409)
t('V001 details again -> already registered', call('/register', ok_details), 409, expect_msg='already')
print("== Duplicate person under another ID")
call('/register', dict(voter_id='V002', name='Same Person', age=30))
t('same face as V001 under V002', call('/register-face', {'voter_id':'V002','images':[A[3],A[2],A[1]]}), 409, 'DUPLICATE_FACE')
call('/register', dict(voter_id='V003', name='Ravi Kumar', age=40))
t('different person V003',   call('/register-face', {'voter_id':'V003','images':D['P1'][:3]}), 200, expect_success=True)
call('/register', dict(voter_id='V004', name='Meena S', age=33))
t('third person V004',       call('/register-face', {'voter_id':'V004','images':D['P2'][:3]}), 200, expect_success=True)
print("== Authentication uses real recognition (not a constant answer)")
def auth(img): 
    st,b = call('/authenticate', {'face_image':img}); return st,b
st,b=auth(A[3]);          print(b); res.append(b.get('voter_id')=='V001')
st,b=auth(D['P1'][3]);    print(b); res.append(b.get('voter_id')=='V003')
st,b=auth(D['P2'][2]);    print(b); res.append(b.get('voter_id')=='V004')
st,b=auth(D['P5'][0]);    print(b); res.append(b.get('success') is False and 'not recognized' in b.get('message',''))
st,b=auth(D['noise']);    print(b); res.append(b.get('code')=='NO_FACE')
st,b=auth(D['multi']);    print(b); res.append(b.get('code')=='MULTIPLE_FACES')
print(f"\n{sum(res)}/{len(res)} checks passed")
