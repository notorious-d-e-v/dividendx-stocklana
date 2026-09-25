import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/node/workspace/dividendx-stocklana/presentation";
const projectDir = "/Users/node/workspace/dividendx-stocklana";
const SKILL_DIR = "/Users/node/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const TMP_DIR = path.join(workspaceDir, "build");
const FINAL_PPTX = path.join(workspaceDir, "output", "DivX-phase-two-v2.pptx");
const RUNTIME_PYTHON = "/Users/node/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const { finalizePresentation, resolvePresentationFont } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const font = resolvePresentationFont({ fontFamily: "Helvetica Neue" });
const C = { paper: "#F6F3EC", surface: "#FFFEFB", ink: "#101820", muted: "#53606B", line: "#D7D2C8", blue: "#2457F5", blueInk: "#1639A6", amber: "#C46A00", amberInk: "#7A4000", paleBlue: "#EAF0FF", paleAmber: "#F8E8D4", green: "#087F5B", red: "#B42318" };
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
p.theme.colorScheme = { name: "DivX", themeColors: { accent1:C.blue,accent2:C.amber,accent3:C.green,accent4:C.red,accent5:"#6B4EFF",accent6:C.muted,bg1:C.paper,bg2:C.surface,tx1:C.ink,tx2:C.muted,dk1:C.ink,dk2:C.muted,lt1:C.surface,lt2:C.paper,hlink:C.blue,folHlink:C.blueInk } };

function box(slide, x,y,w,h, fill="none", line="none", radius=0, name) {
  return slide.shapes.add({ geometry:"rect", name, position:{left:x,top:y,width:w,height:h}, fill, line:{style:"solid",fill:line,width:line==="none"?0:1}, ...(radius?{borderRadius:radius}:{}) });
}
function text(slide, value, x,y,w,h, size=24, color=C.ink, bold=false, opts={}) {
  const s=slide.shapes.add({geometry:"textbox",position:{left:x,top:y,width:w,height:h},fill:"none",line:{fill:"none",width:0}});
  s.text=value;
  s.text.style={typeface:font,fontSize:size,color,bold,autoFit:"none",wrap:"square",verticalAlignment:opts.valign??"top",alignment:opts.align??"left",lineSpacing:opts.lineSpacing??1.04,insets:{left:0,right:0,top:0,bottom:0}};
  return s;
}
function rich(slide, runs, x,y,w,h, size=24, opts={}) {
  const s=text(slide,"",x,y,w,h,size,opts.color??C.ink,opts.bold??false,opts);
  s.text.set([runs.map(r=>typeof r==="string"?r:{run:r.run,textStyle:{typeface:font,...r.style}})]);
  return s;
}
function rule(slide,x,y,w,color=C.line,height=1){ return box(slide,x,y,w,height,color,"none"); }
function label(slide,value,x,y,w,color=C.muted){ return text(slide,value.toUpperCase(),x,y,w,20,12,color,true,{lineSpacing:1}); }
function mark(slide,x,y,scale=1,dark=false){
  box(slide,x,y,18*scale,18*scale,dark?"#7292FF":C.blue,"none",0).position.rotation=45;
  box(slide,x+15*scale,y+15*scale,18*scale,18*scale,dark?"#FFB657":C.amber,"none",0).position.rotation=45;
  if(dark) text(slide,"DivX",x+39*scale,y-1*scale,170*scale,30*scale,20*scale,"#FFFFFF",true,{lineSpacing:1});
  else text(slide,"DivX",x+39*scale,y-1*scale,170*scale,30*scale,20*scale,C.ink,true,{lineSpacing:1});
}
function header(slide,num,title,opts={}){
  slide.background.fill=opts.dark?C.ink:C.paper;
  if(!opts.noMark) mark(slide,74,54,0.72,opts.dark);
  if(title) text(slide,title,74,98,1110,72,42,opts.dark?"#FFFFFF":C.ink,true,{lineSpacing:0.98});
  text(slide,String(num).padStart(2,"0"),1170,58,40,20,12,opts.dark?"#AAB2BA":C.muted,true,{align:"right",lineSpacing:1});
}
function notes(slide,narration,extra=[],sources=[]){
  const items=[`Narration: ${narration}`];
  if(extra.length) items.push(`Presenter notes: ${extra.join(" ")}`);
  if(sources.length) items.push(`Sources (accessed/observed 16 September 2026 unless stated): ${sources.join(" | ")}`);
  slide.speakerNotes.textFrame.setText(items);
  slide.speakerNotes.setVisible(true);
}
function arrow(slide,from,to,color=C.ink,fromSide="right",toSide="left"){
  return slide.shapes.connect(from,to,{kind:"straight",fromSide,toSide,line:{style:"solid",fill:color,width:2},tail:{type:"triangle",width:"sm",length:"sm"}});
}

// 1 — Cover
{
 const s=p.slides.add(); s.background.fill=C.ink;
 mark(s,82,70,1,true);
 label(s,"Stocklana prototype · September 2026",82,146,500,"#AAB2BA");
 rich(s,[{run:"Keep the stock exposure.",style:{color:"#7292FF",bold:true}},{run:"\nSell the dividend rights.",style:{color:"#FFB657",bold:true}}],82,222,1030,220,64,{color:"#FFFFFF",bold:true,lineSpacing:0.93});
 text(s,"A Solana vault for tokenized-stock dividends.",84,493,720,46,25,"#E6E8EA",false,{lineSpacing:1});
 rule(s,84,615,1110,"#303B45",1); label(s,"Concept + working historical calculator",84,640,520,"#AAB2BA");
 notes(s,"DivX is a Solana vault we are building to separate one tokenized stock position into stock exposure and the right to its next dividend-derived xStock units.",["The protocol is not launched. Current software is an approved interface and working historical calculator."],[]);
}

// 2 — Two parties
{
 const s=p.slides.add(); header(s,2,"Two sides of one trade");
 label(s,"Holder",86,194,300,C.blueInk); rich(s,[{run:"“I want cash today",style:{bold:true,color:C.ink}},{run:"\nwhile keeping my stock exposure.”",style:{color:C.muted}}],86,232,410,120,31,{lineSpacing:1.08});
 label(s,"Buyer",823,194,300,C.amberInk); rich(s,[{run:"“I want the next dividend.”",style:{bold:true,color:C.ink}}],823,232,350,90,31,{lineSpacing:1.08});
 const holder=box(s,90,400,190,82,C.surface,C.ink,12,"Holder"); text(s,"HOLDER",112,425,146,30,20,C.ink,true,{align:"center",valign:"middle"});
 const buyer=box(s,1000,400,190,82,C.surface,C.ink,12,"Buyer"); text(s,"BUYER",1022,425,146,30,20,C.ink,true,{align:"center",valign:"middle"});
 const claim=box(s,490,342,300,54,C.paleAmber,C.amber,12,"Dividend right label"); text(s,"DIVIDEND RIGHT",526,357,228,25,15,C.amberInk,true,{align:"center"});
 const pay=box(s,490,486,300,54,C.paleBlue,C.blue,12,"Payment label"); text(s,"PAYMENT",526,501,228,25,15,C.blueInk,true,{align:"center"});
 s.shapes.connect(holder,claim,{kind:"elbow",fromSide:"top",toSide:"left",line:{style:"solid",fill:C.amber,width:2}});
 s.shapes.connect(claim,buyer,{kind:"elbow",fromSide:"right",toSide:"top",line:{style:"solid",fill:C.amber,width:2},tail:{type:"triangle",width:"sm",length:"sm"}});
 s.shapes.connect(buyer,pay,{kind:"elbow",fromSide:"bottom",toSide:"right",line:{style:"solid",fill:C.blue,width:2}});
 s.shapes.connect(pay,holder,{kind:"elbow",fromSide:"left",toSide:"bottom",line:{style:"solid",fill:C.blue,width:2},tail:{type:"triangle",width:"sm",length:"sm"}});
 box(s,90,528,190,46,C.paleBlue,"none",8,"Retained PT"); text(s,"PT retained",112,539,146,24,16,C.blueInk,true,{align:"center"});
 text(s,"The holder sells the dividend claim. The buyer pays its agreed price.",265,629,750,36,20,C.muted,false,{align:"center"});
 notes(s,"A holder could sell a dividend claim for cash while retaining stock exposure. A buyer could take the other side for the next verified dividend allocation.",["These are hypothetical personas. Proceeds require a willing buyer and an agreed market price. DR settles in reinvested xStock units, so its dollar value still moves with the stock."],[]);
}

// 3 — Mechanism
{
 const s=p.slides.add(); header(s,3,"One deposit, two claims");
 const asset=box(s,78,284,170,100,C.ink,C.ink,14,"xStock"); text(s,"xStock",103,306,120,50,32,"#FFFFFF",true,{align:"center",valign:"middle"});
 const vault=box(s,386,266,220,136,C.surface,C.line,16,"Vault"); label(s,"Locked",424,286,142); text(s,"VAULT",424,319,142,46,31,C.ink,true,{align:"center"});
 const pt=box(s,785,180,390,150,C.paleBlue,C.blue,14,"Stock exposure PT"); label(s,"PT",814,202,80,C.blueInk); text(s,"Stock exposure",814,234,320,36,28,C.blueInk,true); text(s,"Collateral remaining after this event’s dividend allocation.",814,278,325,38,15,C.muted,false,{lineSpacing:1.12});
 const dr=box(s,785,374,390,150,C.paleAmber,C.amber,14,"Dividend rights DR"); label(s,"DR",814,396,80,C.amberInk); text(s,"Dividend rights",814,428,320,36,28,C.amberInk,true); text(s,"This event’s dividend-derived share of the collateral.",814,472,325,38,15,C.muted,false,{lineSpacing:1.12});
 arrow(s,asset,vault,C.ink); arrow(s,vault,pt,C.blue); arrow(s,vault,dr,C.amber);
 text(s,"Both claims are backed by the same locked xStock balance.",78,578,770,38,23,C.ink,true);
 text(s,"Redeems in xStock units; dollar value can change.",78,626,770,30,17,C.muted,false);
 label(s,"Schematic, not a 50/50 allocation",924,635,280,C.muted);
 notes(s,"One deposit enters a locked vault. The proposed program issues two paired claims: PT for the stock exposure and DR for this event’s dividend-derived share.",["The diagram is schematic. Deposit must precede the supported event. Claim receipt units differ from raw redemption allocations. Both claims reconcile to one locked xStock balance."],["https://docs.xstocks.fi/developers/multipliers"]);
}

// 4 — Precedents
{
 const s=p.slides.add(); header(s,4,"Established markets, familiar behavior");
 label(s,"Listed dividend derivatives",80,204,470); text(s,"21M+",80,236,470,92,76,C.ink,true,{lineSpacing:0.95}); text(s,"dividend contracts traded on Eurex in 2024",82,340,480,64,22,C.muted,false,{lineSpacing:1.12});
 rule(s,640,198,1,C.line,230);
 label(s,"Onchain yield separation",700,204,470); text(s,"$96.4M",700,236,490,92,76,C.blue,true,{lineSpacing:0.95}); text(s,"average daily trading volume in 2024, reported by Pendle",702,340,470,64,22,C.muted,false,{lineSpacing:1.12});
 rich(s,[{run:"Investors already trade dividends separately.",style:{bold:true,color:C.ink}},{run:"\nCrypto users already separate yield.",style:{bold:true,color:C.ink}}],80,500,1030,90,29,{lineSpacing:1.16});
 text(s,"Different units and markets. These figures show precedents, not demand for DivX.",80,626,1060,28,15,C.muted,false);
 notes(s,"Dividend trading already has precedent. Eurex handled more than 21 million dividend contracts in 2024, while Pendle reported 96.4 million dollars of average daily trading volume for onchain yield markets.",["Contracts and dollars are different measures. Neither figure proves demand for DivX."],["Eurex release, published 6 January 2025: https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358","Pendle team review, published 4 February 2025: https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f"]);
}

// 5 — Market context
{
 const s=p.slides.add(); header(s,5,"Tokenized stocks bring the collateral onchain");
 label(s,"Annual global dividends",80,208,460); text(s,"$1.75T",80,245,460,88,72,C.amber,true,{lineSpacing:0.95}); text(s,"paid in 2024",82,345,460,36,22,C.muted,false);
 rule(s,624,198,1,C.line,230);
 label(s,"Distributed tokenized-stock value",690,208,500); text(s,"$2.92B",690,245,500,88,72,C.blue,true,{lineSpacing:0.95}); text(s,"observed 16 September 2026",692,345,500,36,22,C.muted,false);
 box(s,80,459,1110,2,C.line,"none");
 text(s,"Starting market",80,493,230,30,15,C.muted,true); text(s,"Dividend-paying xStocks on Solana",312,484,650,46,30,C.ink,true);
 text(s,"Eligible xStocks are a subset of the broader dashboard measure.",312,538,700,32,18,C.muted,false);
 text(s,"RWA.xyz includes stocks and ETFs represented natively or synthetically. The measures above are not additive TAM.",80,625,1090,30,15,C.muted,false);
 notes(s,"The wider category is large, but our starting point stays narrow: dividend-paying xStocks on Solana. Global dividends totaled 1.75 trillion dollars in 2024, and RWA.xyz displayed 2.92 billion dollars of distributed tokenized-stock value on September 16.",["The RWA.xyz total includes stocks, ETFs, native instruments, and synthetic representations. Eligible DivX collateral is only a subset. These figures cannot be added into a market-size estimate."],["Janus Henderson, published 2025: https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/","RWA.xyz Stocks dashboard, observed 16 September 2026: https://app.rwa.xyz/stocks"]);
}

// 6 — Solana proposed implementation
{
 const s=p.slides.add(); header(s,6,"What Solana changes");
 const rows=[
  ["01","Locked collateral","The vault holds the assets backing both claims.",C.blue],
  ["02","Atomic issuance","One deposit creates the paired claims together.",C.ink],
  ["03","Separate ownership","Each holder can transfer and redeem under the program’s rules.",C.amber]
 ];
 rows.forEach((r,i)=>{const y=202+i*112; text(s,r[0],80,y,50,34,16,C.muted,true); text(s,r[1],158,y-4,300,40,28,r[3],true); text(s,r[2],508,y,650,45,20,C.muted,false); rule(s,80,y+73,1090,C.line,1);});
 text(s,"Shared program state replaces manual reconciliation of these claims.",158,560,890,40,25,C.ink,true);
 box(s,80,630,1110,38,"#EFECE4","none",0); text(s,"PROPOSED IMPLEMENTATION · Issuer and corporate-action data dependencies remain.",98,640,1050,18,13,C.muted,true,{valign:"middle"});
 notes(s,"Solana gives the proposed vault a shared state for collateral, paired issuance, ownership, and redemption. That can replace manual reconciliation between the two claims.",["These are planned transaction flows, not completed program behavior. The current demonstration is the historical calculator. Solana does not remove issuer control, data trust, access restrictions, or the need for actual liquidity."],["Solana Token Extensions: https://solana.com/docs/tokens/extensions","Scaled UI Amount: https://solana.com/docs/tokens/extensions/scaled-ui-amount"]);
}

// 7 — Corporate actions
{
 const s=p.slides.add(); header(s,7,"A stock split is not a dividend");
 label(s,"Issuer event",80,194,340); label(s,"DivX treatment",455,194,700); rule(s,80,225,1090,C.ink,2);
 text(s,"KOx cash dividend",80,258,320,40,25,C.ink,true); text(s,"Allocate verified dividend-derived KOx to DR",455,258,690,44,23,C.amberInk,true); text(s,"15 Sep 2026 · event 75c0… v2",80,304,320,28,14,C.muted,false); rule(s,80,350,1090,C.line,1);
 text(s,"HONx reverse split",80,390,320,40,25,C.ink,true); text(s,"Reject as a dividend; allocate no dividend yield",455,390,690,44,23,C.red,true); text(s,"29 Jun 2026 · event ccb423… v2",80,436,320,28,14,C.muted,false); rule(s,80,484,1090,C.line,1);
 text(s,"Check the issuer event and the onchain multiplier together.",80,532,1040,40,26,C.ink,true);
 rich(s,[{run:"Pendle",style:{bold:true,color:C.blueInk}},{run:" provides the yield-splitting model. Equities need corporate-action rules.",style:{color:C.muted}}],80,592,1050,48,19,{lineSpacing:1.15});
 notes(s,"Equity accounting is the core distinction. The KOx event is a verified cash dividend. The exact HONx reverse-split event is rejected, because a multiplier change alone cannot identify dividend yield.",["xStocks dividends and splits share Scaled UI Amount. Raw balances stay fixed. Issuer classification is a trusted attestation cross-checked against the multiplier. A later HONx spinoff on 29 June is a separate unsupported event. Pendle can normalize rebasing assets; DivX contributes Solana vault accounting for equity events."],["xStocks multiplier guide: https://docs.xstocks.fi/developers/multipliers","KOx history: https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc","HONx history: https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=HONx&sortBy=createdTimeUtc&sortOrder=asc","Pendle SY docs: https://docs.pendle.finance/pendle-v2-dev/Contracts/StandardizedYield"]);
}

// 8 — Current demo
{
 const s=p.slides.add(); header(s,8,"A real dividend, already inspectable");
 const bytes=await fs.readFile(path.join(workspaceDir,"assets/screenshots/app-preview-divx-v1.jpg"));
 s.images.add({blob:bytes,contentType:"image/png",alt:"DivX historical KOx calculator showing source snapshot, historical allocation scenario, 100 KOx input, 100.0000 KOx stock exposure and 0.4152 KOx dividend rights",fit:"cover",crop:{left:0,top:0,right:0,bottom:0.15},geometry:"roundRect",borderRadius:14,position:{left:55,top:166,width:775,height:495}});
 label(s,"Historical scenario",875,194,300,C.amberInk); text(s,"100 KOx before the event",875,230,320,52,27,C.ink,true,{lineSpacing:1.05});
 text(s,"100.0000 KOx",875,312,320,42,30,C.blue,true); text(s,"stock exposure",875,352,300,26,15,C.muted,false);
 text(s,"+ 0.4152 KOx",875,402,320,42,30,C.amber,true); text(s,"dividend allocation",875,442,300,26,15,C.muted,false);
 rule(s,875,492,310,C.line,1); text(s,"KOx issuer adjustment",875,518,310,28,17,C.ink,true); text(s,"15 September 2026",875,550,310,26,15,C.muted,false);
 box(s,875,597,310,58,C.ink,"none",8); text(s,"Working now: historical calculator\nNext: vault execution",893,608,278,38,15,"#FFFFFF",true,{lineSpacing:1.18});
 notes(s,"The working software already lets anyone inspect a real historical KOx dividend and calculate its allocation. For one hundred pre-event displayed KOx, it shows one hundred KOx of stock exposure plus 0.4152 KOx of dividend allocation.",["This is a historical scenario from a source snapshot, not a wallet position or proof that a vault captured the event. The xStocks issuer adjustment occurred 15 September 2026; Coca-Cola's cash payment date is 1 October. Exact input raw Q=9,819,982,084; PT=9,779,376,057; DR=40,606,027; decimals=8; M0=1.0183317967386898; M1=1.0225601246249238; event 75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e v2. Displayed results are rounded equivalents. No onchain claim issuance exists yet."],["KOx history: https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc","Coca-Cola announcement, published 15 July 2026: https://investors.coca-colacompany.com/news-events/press-releases/detail/1165/board-of-directors-of-the-coca-cola-company-elects-new-officer-and-declares-regular-quarterly-dividend"]);
}

// 9 — Roadmap
{
 const s=p.slides.add(); header(s,9,"One event first");
 label(s,"Hackathon target",80,194,400,C.blueInk);
 const steps=["Deposit","Split","Sell the dividend claim","Redeem separately"];
 const colors=[C.ink,C.blue,C.amber,C.ink];
 const nodes=[];
 steps.forEach((v,i)=>{const x=80+i*285; const w=i===2?225:180; const node=box(s,x,254,w,88,i===1?C.paleBlue:i===2?C.paleAmber:C.surface,colors[i],12,v); text(s,v,x+16,274,w-32,45,i===2?21:23,colors[i],true,{align:"center",valign:"middle"}); nodes.push(node);});
 for(let i=0;i<nodes.length-1;i++) arrow(s,nodes[i],nodes[i+1],C.muted);
 text(s,"Build one complete flow with test assets and a real historical event.",80,396,1010,42,26,C.ink,true);
 rule(s,80,467,1090,C.line,1);
 label(s,"Next",80,502,120); text(s,"A future live series",208,494,370,38,27,C.blue,true); text(s,"then additional stocks and issuers",585,494,520,38,27,C.ink,true);
 text(s,"Backpack is a candidate once its corporate-action data is verified.",80,572,1080,44,17,C.muted,false,{lineSpacing:1.15});
 text(s,"Keep the stock exposure. Sell the dividend rights.",80,642,940,34,24,C.ink,true);
 notes(s,"The hackathon target is one complete flow with test assets and the real historical event: deposit, split, sell the dividend claim, then redeem each side separately.",["This is the next build phase. After that, a future live series can validate the operational path before expansion to other stocks or issuers. Backpack is only a candidate pending corporate-action verification; no partnership or supported integration exists."],["Backpack corporate-actions explainer: https://learn.backpack.exchange/articles/what-are-corporate-actions"]);
}

const stagingDir=path.join(workspaceDir,"build","finalizer");
await fs.mkdir(stagingDir,{recursive:true});
const candidatePath=path.join(stagingDir,"DivX-phase-two-candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const requirements={explicitTotalSlideCount:9,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[]};
const result=await finalizePresentation({
 ...requirements,workspaceDir,candidatePath,finalPath:FINAL_PPTX,pythonExecutable:RUNTIME_PYTHON,
 integrityValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_package_integrity.py"),
 layoutValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_layout_geometry.py"),
 layoutArgs:["--expected-slide-size-emu","12192000,6858000","--validate-heading-fit"],
 fontPolicy:{basis:"design",families:[font]},verifyArtifactToolImport:true,
 receiptPath:path.join(stagingDir,"DivX-phase-two-v2.validation.json")
});
console.log(JSON.stringify({font,candidatePath,finalPath:FINAL_PPTX,result},null,2));
