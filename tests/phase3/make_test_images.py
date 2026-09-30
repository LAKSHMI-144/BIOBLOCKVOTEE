import cv2, numpy as np, base64, json, sys
sys.path.insert(0,'../../python_ai')
from insightface.data import get_image
from insightface.app import FaceAnalysis
img = get_image('t1')
eng = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); eng.prepare(ctx_id=-1, det_size=(640,640))
faces = sorted(eng.get(img), key=lambda f: f.bbox[0])
print("faces in t1:", len(faces), [round(float(f.det_score),2) for f in faces])
def crop(f, scale=2.6):
    x1,y1,x2,y2 = f.bbox; cx,cy=(x1+x2)/2,(y1+y2)/2; s=(x2-x1)*scale
    W,H=640,480; sw=s; sh=s*H/W
    M=np.float32([[W/sw,0,-(cx-sw/2)*W/sw],[0,H/sh,-(cy-sh/2)*H/sh]])
    return cv2.warpAffine(img,M,(W,H),borderMode=cv2.BORDER_REPLICATE)
def variants(base):
    out=[base]
    h,w=base.shape[:2]
    for ang,gain in [(-6,1.08),(5,0.92),(3,1.02)]:
        M=cv2.getRotationMatrix2D((w/2,h/2),ang,1.0+abs(ang)*0.005)
        v=cv2.warpAffine(base,M,(w,h),borderMode=cv2.BORDER_REPLICATE)
        out.append(np.clip(v.astype(np.float32)*gain,0,255).astype(np.uint8))
    return out
enc=lambda a: base64.b64encode(cv2.imencode('.jpg',a,[cv2.IMWRITE_JPEG_QUALITY,90])[1]).decode()
D={}
for i,f in enumerate(faces): 
    D[f'P{i}']=[enc(v) for v in variants(crop(f))]
    print(f'P{i} bbox width in crop ~{(f.bbox[2]-f.bbox[0])*640/((f.bbox[2]-f.bbox[0])*2.6):.0f}px')
D['multi']=enc(cv2.resize(img,(1280,886)))
D['noise']=enc(np.random.randint(0,255,(480,640,3),np.uint8))
D['blank']=enc(np.full((480,640,3),128,np.uint8))
D['blurry']=enc(cv2.GaussianBlur(crop(faces[0]),(0,0),12))
D['dark']=enc((crop(faces[0]).astype(np.float32)*0.12).astype(np.uint8))
D['tiny']=enc(cv2.copyMakeBorder(cv2.resize(crop(faces[0]),(160,120)),180,180,240,240,cv2.BORDER_CONSTANT,value=(90,90,90)))
D['garbage']='aGVsbG8gd29ybGQ='*20
json.dump(D,open('imgs.json','w'))
