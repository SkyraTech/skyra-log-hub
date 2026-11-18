export type RefreshSeconds=0|15|30|60|300;
/** One route-owned timer. Completion schedules the next poll; slow work never overlaps. */
export class DashboardRefreshLoop {
 private timer:ReturnType<typeof setTimeout>|undefined;private active=false;private seconds:RefreshSeconds=0;private failures=0;
 constructor(private readonly run:()=>void,private readonly busy:()=>boolean,private readonly hidden:()=>boolean=()=>typeof document!=='undefined'&&document.hidden,private readonly schedule:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>=(fn,ms)=>setTimeout(fn,ms),private readonly clear:(id:ReturnType<typeof setTimeout>)=>void=id=>clearTimeout(id)){}
 start(){this.active=true;this.arm();}
 set(seconds:number){if(![0,15,30,60,300].includes(seconds))throw new Error('Unsupported refresh interval');this.seconds=seconds as RefreshSeconds;this.failures=0;this.arm();}
 settled(success:boolean){this.failures=success?0:Math.min(4,this.failures+1);this.arm();}
 visibilityChanged(){this.arm();}
 stop(){this.active=false;if(this.timer!==undefined)this.clear(this.timer);this.timer=undefined;}
 private arm(){if(this.timer!==undefined)this.clear(this.timer);this.timer=undefined;if(!this.active||!this.seconds)return;const delay=Math.min(300000,this.seconds*1000*(this.failures?Math.max(2,2**this.failures):1));this.timer=this.schedule(()=>{this.timer=undefined;if(!this.active)return;if(this.hidden()||this.busy()){this.arm();return;}this.run();},delay);}
}
