# Runs the TU Darmstadt reference HSPR code (github.com/HSPR-Software/HSPR) on the synthetic files.
# scipy>=1.14 removed interp2d, so a RegularGridInterpolator shim is installed first.
# Usage: python3 make_ies.py && python3 ref_run.py /path/to/HSPR/src
import sys, numpy as np, scipy.interpolate as si
from scipy.interpolate import RegularGridInterpolator
class interp2d:
    def __init__(self, x, y, z, kind='linear', fill_value=None):
        self.f = RegularGridInterpolator((np.asarray(y), np.asarray(x)), np.asarray(z), bounds_error=False, fill_value=fill_value)
    def __call__(self, xn, yn):
        X, Y = np.meshgrid(np.atleast_1d(xn), np.atleast_1d(yn))
        return self.f(np.stack([Y.ravel(), X.ravel()], -1)).reshape(X.shape)
si.interp2d = interp2d
REF = sys.argv[1] if len(sys.argv) > 1 else '../HSPR/src'  # path to HSPR-Software/HSPR/src
sys.path.insert(0, REF)
from func.read_files import read_ies_file
from func.evaluate_zone import evaluate_zone
from func.evaluate_width import evaluate_width
from func.evaluate_point import evaluate_point
from func.compute_lb_glare import compute_lb_glare
from func.weighted_sum import weighted_sum
from func.total_luminous_flux import compute_total_luminous_flux
from func.merge_light_distributions import merge_light_distributions
from assessments.lb_normalized_points import lb_normalized_points
from assessments.hb_normalized_points import hb_normalized_points

def load(a, b):
    ms = []
    for p in (a, b):
        _, V, H, I = read_ies_file(open(p).read()); ms.append(I)
    return np.array(ms), H, V, ['X_LH', 'X_RH']

h, w = 0.65, 1.4
m, H, V, n = load('lb.ies', 'lb_rh.ies'); a = w/2
op=[71.6,71.5,32.7,4.8,7.6,5.9,6.6,747.6,0.73]; tp=[95.1,138.4,48.4,12.5,16.3,9.6,10.5,1785.1,0.27]
r = {}
r['A']=evaluate_zone(m,H,V,n,a,h,op[0],tp[0],DirX=[0,1.5,3],DirY=0)
r['B']=evaluate_zone(m,H,V,n,a,h,op[1],tp[1],DirX=[0,1.5,3],DirY=0,theta=5)
r['C']=evaluate_zone(m,H,V,n,a,h,op[2],tp[2],DirX=[-3,-4.5,-6],DirY=0.25)
r['Doff']=evaluate_width(m,H,V,n,a,h,op[3],tp[3],DirX=-20,DirY=0,DirZ=[30,40,50])
r['Dnear']=evaluate_width(m,H,V,n,a,h,op[4],tp[4],DirX=20,DirY=0,DirZ=[30,40,50])
r['Eoff']=evaluate_width(m,H,V,n,a,h,op[5],tp[5],DirX=-20,DirY=0.25,DirZ=[10,20])
r['Enear']=evaluate_width(m,H,V,n,a,h,op[6],tp[6],DirX=20,DirY=0.25,DirZ=[10,20])
L, nh = merge_light_distributions(m,V,H,n,headlight_spread_distance=w,distance=1000)
r['Flux']=compute_total_luminous_flux(L,nh,V,[-45,45],[-15,5],op[7],tp[7])
g=[compute_lb_glare(m[i], -a if i==0 else a, h, H, V, horizontal_edges=[-7.9,1.3]) for i in range(2)]
r['Glare']=weighted_sum(g,op[8],tp[8])
for k,v in r.items(): print('LB',k,float(v[0]),float(v[1]))
print('LB score', lb_normalized_points(*[r[k][1] for k in ['A','B','C','Doff','Dnear','Eoff','Enear','Flux','Glare']]))

m, H, V, n = load('hb.ies', 'hb.ies'); h=0.7; w=1.3; a=w/2
op=[133.3,29.1,31.5,41.9,134.2,5.5,5.9,1114.1]; tp=[235.0,61.0,63.3,81.4,207.7,10.5,10.9,3126.1]
r={}
r['PA']=evaluate_point(m,H,V,n,a,h,op[0],tp[0],DirX=0,DirY=h)
r['PB']=evaluate_point(m,H,V,n,a,h,op[1],tp[1],DirX=-20,DirY=h)
r['PC']=evaluate_point(m,H,V,n,a,h,op[2],tp[2],DirX=0,DirY=9+h)
r['PD']=evaluate_point(m,H,V,n,a,h,op[3],tp[3],DirX=20,DirY=h)
r['PE']=evaluate_point(m,H,V,n,a,h,op[4],tp[4],DirX=0,DirY=-2+h)
r['Eoff']=evaluate_width(m,H,V,n,a,h,op[5],tp[5],DirX=-20,DirY=0.25,DirZ=[10,20])
r['Enear']=evaluate_width(m,H,V,n,a,h,op[6],tp[6],DirX=20,DirY=0.25,DirZ=[10,20])
L, nh = merge_light_distributions(m,V,H,n,headlight_spread_distance=w,distance=1000)
r['Flux']=compute_total_luminous_flux(L,nh,V,[-45,45],[-5,10],op[7],tp[7])
for k,v in r.items(): print('HB',k,float(v[0]),float(v[1]))
print('HB score', hb_normalized_points(*[r[k][1] for k in ['PA','PB','PC','PD','PE','Eoff','Enear','Flux']]))
