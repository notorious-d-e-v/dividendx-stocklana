import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/node/workspace/dividendx-stocklana/presentation";
const projectDir = "/Users/node/workspace/dividendx-stocklana";
const SKILL_DIR = "/Users/node/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const TMP_DIR = path.join(workspaceDir, "build");
const FINAL_PPTX = path.join(workspaceDir, "output", "DividendX-phase-two-v3.pptx");
const RUNTIME_PYTHON = "/Users/node/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const { finalizePresentation, resolvePresentationFont } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const font = resolvePresentationFont({ fontFamily: "Helvetica Neue" });
const C = { paper: "#F6F3EC", surface: "#FFFEFB", ink: "#101820", muted: "#53606B", line: "#D7D2C8", blue: "#2457F5", blueInk: "#1639A6", amber: "#C46A00", amberInk: "#7A4000", paleBlue: "#EAF0FF", paleAmber: "#F8E8D4", green: "#087F5B", red: "#B42318" };
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
p.theme.colorScheme = { name: "DividendX", themeColors: { accent1:C.blue,accent2:C.amber,accent3:C.green,accent4:C.red,accent5:"#6B4EFF",accent6:C.muted,bg1:C.paper,bg2:C.surface,tx1:C.ink,tx2:C.muted,dk1:C.ink,dk2:C.muted,lt1:C.surface,lt2:C.paper,hlink:C.blue,folHlink:C.blueInk } };

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
  if(dark) text(slide,"DividendX",x+39*scale,y-1*scale,170*scale,30*scale,20*scale,"#FFFFFF",true,{lineSpacing:1});
  else text(slide,"DividendX",x+39*scale,y-1*scale,170*scale,30*scale,20*scale,C.ink,true,{lineSpacing:1});
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
 notes(s,"DividendX is a Solana vault we are building to separate one tokenized stock position into stock exposure and the right to its next dividend-derived xStock units.",["The protocol is not launched. Current software is an approved interface and working historical calculator."],[]);
}

// 2 — Two parties
{
 const s=p.slides.add(); header(s,2,"Two sides of one trade");
 label(s,"Traditional dividend market",80,180,420,C.muted);
 label(s,"Sellers",80,222,180,C.blueInk); text(s,"Bank trading desks",80,248,450,36,28,C.ink,true); text(s,"Manage dividend risk from structured products.",80,292,460,36,18,C.muted,false);
 label(s,"Buyers",704,222,180,C.amberInk); text(s,"Asset managers and hedge funds",704,248,490,36,28,C.ink,true); text(s,"Trade expected payouts. Survista is one documented buyer.",704,292,490,42,18,C.muted,false,{lineSpacing:1.12});
 rule(s,80,354,1110,C.line,1); label(s,"DividendX flow",80,377,240,C.muted);
 const holder=box(s,90,454,190,74,C.surface,C.ink,12,"Stock holder"); text(s,"STOCK HOLDER",112,476,146,30,18,C.ink,true,{align:"center",valign:"middle"});
 const buyer=box(s,1000,454,190,74,C.surface,C.ink,12,"Buyer"); text(s,"BUYER",1022,476,146,30,18,C.ink,true,{align:"center",valign:"middle"});
 const claim=box(s,490,407,300,50,C.paleAmber,C.amber,12,"Dividend right label"); text(s,"DIVIDEND RIGHT",526,420,228,25,15,C.amberInk,true,{align:"center"});
 const pay=box(s,490,526,300,50,C.paleBlue,C.blue,12,"Payment label"); text(s,"PAYMENT",526,539,228,25,15,C.blueInk,true,{align:"center"});
 s.shapes.connect(holder,claim,{kind:"elbow",fromSide:"top",toSide:"left",line:{style:"solid",fill:C.amber,width:2}});
 s.shapes.connect(claim,buyer,{kind:"elbow",fromSide:"right",toSide:"top",line:{style:"solid",fill:C.amber,width:2},tail:{type:"triangle",width:"sm",length:"sm"}});
 s.shapes.connect(buyer,pay,{kind:"elbow",fromSide:"bottom",toSide:"right",line:{style:"solid",fill:C.blue,width:2}});
 s.shapes.connect(pay,holder,{kind:"elbow",fromSide:"left",toSide:"bottom",line:{style:"solid",fill:C.blue,width:2},tail:{type:"triangle",width:"sm",length:"sm"}});
 box(s,90,571,190,42,C.paleBlue,"none",8,"Retained PT"); text(s,"PT retained",112,581,146,22,15,C.blueInk,true,{align:"center"});
 text(s,"Stock exposure stays with the holder.",80,638,470,26,17,C.muted,false);
 notes(s,"Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DividendX brings the same choice to xStock holders: keep the stock exposure and sell the dividend rights.",["The institutions shown are participants in traditional dividend markets, not DividendX users. Bank direction varies by book and tenor; hedge funds can buy or sell. Traditional dividend futures and swaps are generally cash-settled. DividendX allocates collateral in xStock units, and proceeds require a willing buyer at an agreed price."],["Eurex 2025 whitepaper, pp. 31–32: https://www.eurex.com/resource/blob/4418754/f90fd622a278beb08757729864e93925/data/whitepaper-derivatives-forum-frankfurt-2025.pdf","CME, Trading Dividend Uncertainty, 2024: https://www.cmegroup.com/articles/2024/trading-dividend-uncertainty.html","CME dividend-futures primer, 2024: https://www.cmegroup.com/articles/2024/equity-index-dividend-futures-a-primer.html"]);
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
 notes(s,"One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Both claims are backed by the same xStock collateral and redeem in xStock units whose dollar value can change.",["This present-tense language explains the product mechanics, not deployed execution. The diagram is schematic. Deposit must precede the supported event. Claim receipt units differ from raw redemption allocations."],["https://docs.xstocks.fi/developers/multipliers"]);
}

// 4 — Precedents
{
 const s=p.slides.add(); header(s,4,"Established markets, familiar behavior");
 label(s,"Listed dividend derivatives",80,204,470); text(s,"21M+",80,236,470,92,76,C.ink,true,{lineSpacing:0.95}); text(s,"dividend contracts traded on Eurex in 2024",82,340,480,64,22,C.muted,false,{lineSpacing:1.12});
 rule(s,640,198,1,C.line,230);
 label(s,"Onchain yield separation",700,204,470); text(s,"$96.4M",700,236,490,92,76,C.blue,true,{lineSpacing:0.95}); text(s,"average daily trading volume in 2024, reported by Pendle",702,340,470,64,22,C.muted,false,{lineSpacing:1.12});
 rich(s,[{run:"Investors already trade dividends separately.",style:{bold:true,color:C.ink}},{run:"\nCrypto users already separate yield.",style:{bold:true,color:C.ink}}],80,500,1030,90,29,{lineSpacing:1.16});
 text(s,"Established markets for trading dividends and separating yield.",80,626,1060,28,16,C.muted,false);
 notes(s,"Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DividendX connects those two ideas.",["Contracts and dollars are different measures. These figures establish precedents; they do not prove demand for DividendX or forecast future volume."],["Eurex release, published 6 January 2025: https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358","Pendle team review, published 4 February 2025: https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f"]);
}

// 5 — Market context
{
 const s=p.slides.add(); header(s,5,"Tokenized stocks bring the collateral onchain");
 label(s,"Annual global dividends",80,208,460); text(s,"$1.75T",80,245,460,88,72,C.amber,true,{lineSpacing:0.95}); text(s,"paid in 2024",82,345,460,36,22,C.muted,false);
 rule(s,624,198,1,C.line,230);
 label(s,"Distributed tokenized-stock value",690,208,500); text(s,"$2.92B",690,245,500,88,72,C.blue,true,{lineSpacing:0.95}); text(s,"observed 16 September 2026",692,345,500,36,22,C.muted,false);
 box(s,80,459,1110,2,C.line,"none");
 text(s,"Starting market",80,493,230,30,15,C.muted,true); text(s,"Dividend-paying xStocks on Solana",312,484,650,46,30,C.ink,true);
 text(s,"Coca-Cola first. More dividend-paying stocks next.",312,538,760,32,18,C.blueInk,true);
 text(s,"RWA.xyz includes stocks and ETFs represented natively or synthetically.",80,625,1090,30,15,C.muted,false);
 notes(s,"Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. We start with dividend-paying xStocks on Solana, then expand to more familiar companies and additional issuers.",["The RWA.xyz total includes stocks, ETFs, native instruments, and synthetic representations. Eligible DividendX collateral is only a subset. The two measures are not additive TAM and do not support a growth estimate."],["Janus Henderson, published 2025: https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/","RWA.xyz Stocks dashboard, observed 16 September 2026: https://app.rwa.xyz/stocks"]);
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
 text(s,"One program coordinates both claims.",158,560,890,40,26,C.ink,true);
 notes(s,"Solana brings collateral and both claims into one shared system. The deposit and paired claims are created together in one transaction. Each owner can transfer and redeem their claim under the same program rules, reducing the separate records and reconciliation needed between counterparties.",["This describes the intended product mechanics, not a deployed program. Issuer controls, event-data trust, operating rules, access restrictions, and actual market liquidity remain dependencies."],["Solana transactions: https://solana.com/docs/core/transactions","Solana token extensions: https://solana.com/docs/tokens/extensions"]);
}

// 7 — Fractional ownership and auditability
{
 const s=p.slides.add(); header(s,7,"Fractional ownership and auditability");
 label(s,"Fractional ownership",80,198,470,C.amberInk); text(s,"Buy or sell part of a dividend claim.",80,234,480,72,31,C.ink,true,{lineSpacing:1.05});
 const whole=box(s,80,344,460,48,C.paleAmber,C.amber,10,"Dividend claim"); text(s,"DIVIDEND CLAIM",98,358,424,20,14,C.amberInk,true,{align:"center"});
 const partA=box(s,80,422,155,66,C.surface,C.amber,10,"Holder part"); text(s,"holder keeps",96,442,123,22,16,C.amberInk,true,{align:"center"});
 const partB=box(s,263,422,277,66,C.paleAmber,C.amber,10,"Buyer part"); text(s,"buyer takes part",281,442,241,22,16,C.amberInk,true,{align:"center"});
 arrow(s,whole,partA,C.amber,"bottom","top"); arrow(s,whole,partB,C.amber,"bottom","top");
 rule(s,624,190,1,C.line,356);
 label(s,"Auditability",690,198,460,C.blueInk); text(s,"Inspect the onchain record.",690,234,480,50,31,C.ink,true);
 const auditRows=[["01","Vault balance"],["02","Claims outstanding"],["03","Redemption history"]];
 auditRows.forEach((r,i)=>{const y=332+i*72; text(s,r[0],690,y,44,24,14,C.muted,true); text(s,r[1],756,y-2,380,28,22,i===0?C.blue:C.ink,true); rule(s,690,y+42,470,C.line,1);});
 text(s,"Built on shared token standards that other Solana apps can integrate.",80,606,1080,46,25,C.ink,true);
 notes(s,"Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. The same token standards also make the claims available for other Solana applications to integrate.",["Onchain token accounts expose program state; they do not independently prove offchain custody reserves, correct issuer data, or correct program code. Corporate-action handling remains technical Q&A: the verified KOx dividend is accepted, while the exact HONx reverse split and later spinoff are unsupported dividend events."],["Solana tokens: https://solana.com/docs/tokens","Solana accounts: https://solana.com/docs/core/accounts","Solana transactions: https://solana.com/docs/core/transactions","Token supply RPC: https://solana.com/docs/rpc/http/gettokensupply","KOx history: https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc","HONx history: https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=HONx&sortBy=createdTimeUtc&sortOrder=asc"]);
}

// 8 — Current demo
{
 const s=p.slides.add(); header(s,8,"Coca-Cola, in dollars");
 const bytes=await fs.readFile(path.join(projectDir,"design/previews/desktop-app.png"));
 s.images.add({blob:bytes,contentType:"image/png",alt:"DividendX historical KOx calculator showing source snapshot, historical allocation scenario, 100 KOx input, 100.0000 KOx stock exposure and 0.4152 KOx dividend rights",fit:"cover",crop:{left:0,top:0,right:0,bottom:0.15},geometry:"roundRect",borderRadius:14,position:{left:55,top:166,width:775,height:495}});
 label(s,"Historical scenario",875,188,300,C.amberInk); text(s,"100 Coca-Cola share-equivalents",875,220,320,58,23,C.ink,true,{lineSpacing:1.06}); text(s,"KOx",875,278,300,22,14,C.muted,true);
 text(s,"≈ $8,935",875,316,320,44,34,C.blue,true); text(s,"100.0000 KOx · stock exposure",875,360,310,24,15,C.muted,false);
 text(s,"≈ $37.10",875,407,320,44,34,C.amber,true); text(s,"0.4152 KOx · dividend allocation",875,451,310,24,15,C.muted,false);
 text(s,"At the event-implied $89.35/share",875,494,310,28,16,C.ink,true); rule(s,875,530,310,C.line,1); text(s,"Event · 15 September 2026",875,548,310,26,15,C.muted,false);
 box(s,875,597,310,58,C.ink,"none",8); text(s,"Working now: historical calculator\nNext: vault execution",893,608,278,38,15,"#FFFFFF",true,{lineSpacing:1.18});
 notes(s,"Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.",["Valuation basis: P = $0.371 / (1.0225601246249238 / 1.0183317967386898 - 1) = $89.349999989, approximately $89.35/share. The $37.10 is the event's net reinvestment reference value, not cash paid by DividendX, a DR sale price, or a guaranteed payout. Both claims redeem in xStock units and their dollar value changes. Screenshot is a historical scenario, not a wallet position or proof that a vault captured the event. Exact raw Q=9,819,982,084; PT=9,779,376,057; DR=40,606,027; decimals=8; event 75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e v2. Coca-Cola company payment date is 1 October 2026; issuer adjustment is 15 September."],["KOx history: https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc","xStocks multiplier mechanics: https://docs.xstocks.fi/developers/multipliers","Coca-Cola announcement, published 15 July 2026: https://investors.coca-colacompany.com/news-events/press-releases/detail/1165/board-of-directors-of-the-coca-cola-company-elects-new-officer-and-declares-regular-quarterly-dividend"]);
}

// 9 — Roadmap
{
 const s=p.slides.add(); header(s,9,"One event first");
 label(s,"Hackathon target",80,194,400,C.blueInk);
 const steps=["Deposit","Split","Sell the dividend","Redeem separately"];
 const colors=[C.ink,C.blue,C.amber,C.ink];
 const nodes=[];
 steps.forEach((v,i)=>{const x=80+i*285; const w=i===2?225:180; const node=box(s,x,254,w,88,i===1?C.paleBlue:i===2?C.paleAmber:C.surface,colors[i],12,v); text(s,v,x+16,274,w-32,45,i===2?21:23,colors[i],true,{align:"center",valign:"middle"}); nodes.push(node);});
 for(let i=0;i<nodes.length-1;i++) arrow(s,nodes[i],nodes[i+1],C.muted);
 label(s,"Roadmap",80,382,180,C.muted); rule(s,80,414,1090,C.line,1);
 const roadmap=[["01","More xStocks","Apple · Microsoft · NVIDIA"],["02","More Solana issuers","Backpack · Ondo"],["03","Across networks","Coinbase on Base · Robinhood Chain stock tokens"]];
 roadmap.forEach((r,i)=>{const y=435+i*57; text(s,r[0],80,y,40,24,13,C.muted,true); text(s,r[1],145,y-2,285,28,20,i===0?C.blue:i===1?C.amberInk:C.ink,true); text(s,r[2],458,y-2,700,30,19,C.muted,false); if(i<2) rule(s,145,y+39,1015,C.line,1);});
 text(s,"Solana as the home base for dividend liquidity.",80,634,980,34,25,C.ink,true);
 notes(s,"The hackathon target is one complete flow: deposit, split, sell the dividend, redeem each side separately. Next come Apple, Microsoft and NVIDIA xStocks, then Backpack and Ondo. The longer-term vision reaches Coinbase and Robinhood assets on other networks, with Solana as our home base for dividend liquidity.",["The hackathon execution uses test assets and the verified historical KOx event. Every roadmap item is future work, not a partnership or integration claim. xStocks AAPLx, MSFTx and NVDAx exist; exact Solana mints and event feeds still require approval. Selected Backpack and Ondo products have Solana representations. Coinbase products are on Base. Only Robinhood's new wallet-held Stock Tokens on Robinhood Chain are in scope, not legacy Classic tokens. Cross-chain custody, settlement and messaging remain future design work."],["xStocks: https://xstocks.fi/","xStocks docs: https://docs.xstocks.fi/docs","Backpack MU: https://learn.backpack.exchange/blog/tokenized-micron-mu","Ondo Stocks: https://ondo.finance/ondo-stocks","Coinbase Tokenized Stocks: https://www.coinbase.com/tokenize","Robinhood Stock Tokens: https://robinhood.com/rhj/stocktokens/","Robinhood Chain: https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/"]);
}

const stagingDir=path.join(workspaceDir,"build","finalizer");
await fs.mkdir(stagingDir,{recursive:true});
const candidatePath=path.join(stagingDir,"DividendX-phase-two-candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const requirements={explicitTotalSlideCount:9,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[]};
const result=await finalizePresentation({
 ...requirements,workspaceDir,candidatePath,finalPath:FINAL_PPTX,pythonExecutable:RUNTIME_PYTHON,
 integrityValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_package_integrity.py"),
 layoutValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_layout_geometry.py"),
 layoutArgs:["--expected-slide-size-emu","12192000,6858000","--validate-heading-fit"],
 fontPolicy:{basis:"design",families:[font]},verifyArtifactToolImport:true,
 receiptPath:path.join(stagingDir,"DividendX-phase-two-v3.validation.json")
});
console.log(JSON.stringify({font,candidatePath,finalPath:FINAL_PPTX,result},null,2));
