import numpy as np
def write(path, H, V, I):
    with open(path,'w') as f:
        f.write("IESNA:LM-63-2002\n[TEST] synthetic\n[MANUFAC] test\nTILT=NONE\n")
        f.write(f"1 -1 1 {len(V)} {len(H)} 2 2 0 0 0\n1 1 0\n")
        f.write(" ".join(f"{v:g}" for v in V)+"\n"+" ".join(f"{h:g}" for h in H)+"\n")
        for j in range(len(H)):
            f.write(" ".join(f"{I[i,j]:.2f}" for i in range(len(V)))+"\n")
H = np.round(np.arange(-60,60.01,0.25),3); V = np.round(np.arange(-20,20.01,0.1),3)
HH,VV = np.meshgrid(H,V)
# passing beam: cutoff -0.57 left, 15deg kink right, hotspot 2R 1.8D
cut = np.where(HH<0, -0.57, np.minimum(-0.57+np.tan(np.deg2rad(15))*HH, 1.5))
soft = 1/(1+np.exp((VV-cut)/0.08))
spread = 4000*np.exp(-(HH/28)**2)*np.exp(-((VV+4)/4)**2)
hot = 32000*np.exp(-((HH-2)/6)**2-((VV+1.6)/1.1)**2)
lb = (hot+spread+9000*np.exp(-((HH-1)/14)**2-((VV+1.2)/1.8)**2))*soft + 150*np.exp(-(HH/20)**2)
lb = lb*np.where(VV<-12,0.3,1)
write("lb.ies",H,V,lb)
hb = 55000*np.exp(-(HH/4.5)**2-((VV-0.2)/2.2)**2)+9000*np.exp(-(HH/16)**2-(VV/5)**2)+lb*0.0
write("hb.ies",H,V,hb)
# right lamp slightly different
write("lb_rh.ies",H,V,lb*0.92)
print(lb.max(), hb.max())

# edge case: passing beam with almost no light left of 6°L, so most Zone C lines never reach their lux level
cut = np.where(HH<0, -0.57, np.minimum(-0.57+np.tan(np.deg2rad(15))*HH, 1.5))
soft = 1/(1+np.exp((VV-cut)/0.08))
dark = (30000*np.exp(-((HH-3)/5)**2-((VV+1.6)/1.0)**2) + 5000*np.exp(-(HH/22)**2-((VV+3)/3)**2))*soft
dark = dark/(1+np.exp(-(HH+6)/0.5))
write("dark_left.ies",H,V,dark)
