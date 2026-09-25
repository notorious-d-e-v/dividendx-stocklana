import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/node/workspace/dividendx-stocklana/presentation";
const projectDir = "/Users/node/workspace/dividendx-stocklana";
const SKILL_DIR = "/Users/node/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const TMP_DIR = path.join(workspaceDir, "build", "illustrated-v3");
const ASSET_DIR = path.join(workspaceDir, "assets", "illustrated-v1");
const COMPOSABILITY_ASSET = path.join(projectDir, "design", "illustrations", "assets", "stock-and-dividend-composability-v1.png");
const FINAL_PPTX = path.join(workspaceDir, "output", "DivX-Stocklana-2026.pptx");
const RUNTIME_PYTHON = "/Users/node/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const { finalizePresentation, resolvePresentationFont } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const font = resolvePresentationFont({ fontFamily: "Helvetica Neue" });
const canonicalNarration = ["DivX lets you keep the stock exposure and sell the right to a year of dividends. A dividend is a payment a company makes to its shareholders. We built this for Stocklana on Solana. The program and demo work today with test assets.", "People already trade dividends separately in traditional finance. Banks use dividend contracts to manage risk from structured products. Investment funds buy exposure to future dividends. DivX brings that choice to people who hold tokenized stocks.", "In this example, deposit 100 stock tokens into a vault. Receive 100 PT for the stock exposure and 100 DR for the year’s dividend rights. The stock tokens stay in the vault. You can keep, transfer or trade each side. The counts describe claims, not a promised dividend amount.", "More than 21 million dividend contracts traded on Eurex in 2024. In crypto, Pendle separates principal from future yield. These markets show that people want to trade income separately from an asset. DivX brings that idea to stock tokens.", "Each stock token and year has its own series. Deposits close when the year starts. DR accumulates qualified dividends with ex-dates in that year. Matching PT and DR can be put back together. Once the year ends and its records are finalized, each side can redeem separately. Accumulated dividend rights do not expire.", "Stock-token trading is already happening on Solana. Galaxy reports that its share reached over 95 percent during the second quarter of 2026. We want to start where the activity is and give that capital more things to do. Fast settlement, fractional positions and auditable records make both tokens useful to other builders.", "We have demonstrated a dividend-right market using Raydium with test assets. Next, compatible markets could use Meteora for liquidity and Jupiter for routing and orders. Streamflow could support agreed-price sales. Jupiter Lock and Streamflow could schedule delivery, while Squads could manage a shared treasury. Lending comes later, with reliable prices and enough liquidity.", "The guided tour lets anyone split a stock token, put it back together, see the dividend effect and trade dividend rights with a second wallet. It runs real program transactions in a private sandbox with synthetic assets and accelerated time. The public devnet app uses the real calendar. Our test catalog represents selected stocks from Ondo, Backpack and xStocks.", "The annual program, transaction SDK and guided demo are working. Before mainnet, we need complete issuer records, reviewed settlement operations, independent security review and legal and issuer checks. More liquidity, rolling dividend strategies and other networks come later. Try the guided demo at divx.payai.network. No wallet or real funds are needed."];
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
  if(title) text(slide,title,74,98,1110,72,42,opts.dark?"#FFFFFF":C.ink,true,{lineSpacing:1.05});
  text(slide,String(num).padStart(2,"0"),1170,58,40,20,12,opts.dark?"#AAB2BA":C.muted,true,{align:"right",lineSpacing:1});
}
let notesIndex=0;
function notes(slide,narration,extra=[],sources=[]){
  const items=[`Narration: ${canonicalNarration[notesIndex++] ?? narration}`];
  if(extra.length) items.push(`Presenter notes: ${extra.join(" ")}`);
  if(sources.length) items.push(`Sources and evidence: ${sources.join(" | ")}`);
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
 rich(s,[{run:"Keep the stock exposure.",style:{color:"#7292FF",bold:true}},{run:"\nSell the dividend rights.",style:{color:"#FFB657",bold:true}}],82,222,1030,220,64,{color:"#FFFFFF",bold:true,lineSpacing:1.05});
 text(s,"A dividend market for tokenized stocks on Solana.",84,493,780,46,25,"#E6E8EA",false,{lineSpacing:1});
 rule(s,84,615,1110,"#303B45",1); label(s,"Working program · Public devnet · Guided sandbox",84,640,520,"#AAB2BA");
 notes(s,"",["Working annual-claims prototype with synthetic test assets. No mainnet launch, qualified live issuer settlement or partnership claim."],["planning/mainnet-readiness-2026-09-20.md","https://hackathons.solana.com/hackathons/stocklana"]);
}

// 2 — Two parties
{
 const s=p.slides.add(); header(s,2,"Two sides of one trade");
 label(s,"Traditional dividend market",80,180,420,C.muted);
 label(s,"Sellers",80,222,180,C.blueInk); text(s,"Bank trading desks",80,248,450,36,28,C.ink,true); text(s,"Manage dividend risk from structured products.",80,292,460,36,18,C.muted,false);
 label(s,"Buyers",704,222,180,C.amberInk); text(s,"Asset managers and hedge funds",704,248,490,36,28,C.ink,true); text(s,"Trade expected payouts. Survista is one documented buyer.",704,292,490,42,18,C.muted,false,{lineSpacing:1.12});
 rule(s,80,354,1110,C.line,1); label(s,"DivX flow",80,377,240,C.muted);
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
 notes(s,"Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DivX brings that choice to tokenized-stock holders: keep the stock exposure and sell the dividend rights.",["The institutions shown are participants in traditional dividend markets, not DivX users. Bank direction varies by book and tenor; hedge funds can buy or sell. Traditional dividend futures and swaps are generally cash-settled. DivX allocates collateral in the deposited stock token, and proceeds require a willing buyer at an agreed price."],["Eurex 2025 whitepaper, pp. 31–32: https://www.eurex.com/resource/blob/4418754/f90fd622a278beb08757729864e93925/data/whitepaper-derivatives-forum-frankfurt-2025.pdf","CME, Trading Dividend Uncertainty, 2024: https://www.cmegroup.com/articles/2024/trading-dividend-uncertainty.html","CME dividend-futures primer, 2024: https://www.cmegroup.com/articles/2024/equity-index-dividend-futures-a-primer.html"]);
}

// 3 — Updated vault illustration with editable claim labels
{
 const s=p.slides.add(); header(s,3,"One deposit, two tokens");
 const illustration=await fs.readFile(path.join(projectDir,"design/illustrations/assets/deposit-vault-claims-v1.png"));
 s.images.add({blob:illustration,contentType:"image/png",alt:"A stock certificate enters a custody vault; a blue principal certificate and amber dividend claim emerge",fit:"contain",position:{left:73,top:200,width:750,height:445}});
 text(s,"Deposit 100 stock tokens",80,178,720,34,24,C.ink,true);
 text(s,"100 PT",870,208,320,65,48,C.blue,true);
 text(s,"Stock exposure",872,278,325,38,25,C.blueInk,true);
 text(s,"100 DR",870,382,320,65,48,C.amber,true);
 text(s,"The year’s dividend rights",872,452,328,68,25,C.amberInk,true,{lineSpacing:1.1});
 text(s,"The stock tokens stay in the vault.",80,651,740,28,20,C.muted);
 text(s,"Keep, transfer or trade\neither side.",870,577,320,70,23,C.ink,true,{lineSpacing:1.15});
 notes(s,"",["Illustrative 100-unit display, not a 50/50 value allocation or guaranteed payout. PT and DR redeem in the deposited token; their dollar values can change. Raw issuance is one raw PT and one raw DR per deposited raw unit; displayed counts depend on series denomination and scaling."],["spec/annual-series-accounting.md","design/illustrations/assets/deposit-vault-claims-v1.png","design/illustrations/social/deposit-split-counts-v2.jpg"]);
}

// 4 — Precedents
{
 const s=p.slides.add(); header(s,4,"Established markets, familiar behavior");
 label(s,"Listed dividend derivatives",80,204,470); text(s,"21M+",80,236,470,92,76,C.ink,true,{lineSpacing:0.95}); text(s,"dividend contracts traded on Eurex in 2024",82,340,480,64,22,C.muted,false,{lineSpacing:1.12});
 rule(s,640,198,1,C.line,230);
 label(s,"Onchain yield separation",700,204,470); text(s,"Pendle",700,236,490,92,76,C.blue,true,{lineSpacing:0.95}); text(s,"Separate principal from future yield",702,340,470,64,22,C.muted,false,{lineSpacing:1.12});
 rich(s,[{run:"Investors already trade dividends separately.",style:{bold:true,color:C.ink}},{run:"\nCrypto users already separate yield.",style:{bold:true,color:C.ink}}],80,500,1030,90,29,{lineSpacing:1.16});

 notes(s,"",["Historical precedents validate the use case, not demand for DivX or the safety of this implementation. The Eurex figure measures contracts traded, not dollars of liquidity."],["https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358","https://docs.pendle.finance/pendle-v2/ProtocolMechanics/YieldTokenization/PT"]);
}

// 5 — Annual claims, kept simple
{
 const s=p.slides.add(); header(s,5,"One year of dividend rights");
 label(s,"Coca-Cola example · KOx 2027",80,190,850);
 text(s,"PT-KOx-2027",80,226,490,52,37,C.blue,true);
 text(s,"DR-KOx-2027",700,226,490,52,37,C.amber,true);
 const rows=[
 ["Before the year","Deposit and split. New deposits close at the start of 2027."],
 ["During the year","DR accumulates every qualified dividend for that year."],
 ["Put them together","Recombine matching PT and DR to recover their backing."],
 ["After finalization","Redeem either side separately. Accrued rights do not expire."]
 ];
 rows.forEach((r,i)=>{const y=329+i*73; rule(s,80,y-16,1110);text(s,r[0],80,y,285,35,23,i===3?C.amberInk:C.ink,true);text(s,r[1],388,y,800,55,21,C.muted);});
 text(s,"Separate backing for every issuer, stock token and year.",80,660,1110,28,20,C.ink,true);
 notes(s,"",["Qualified official ex-dates determine the annual event set. Maturity stops new accrual eligibility; finalization requires complete, resolved records and may occur later. Cancellations, corrections, unsupported actions and cumulative rounding are tested. Unsupported actions block unsafe finalization. DR transfers include accrued allocation. Reinvested dividends settle in stock tokens, not guaranteed cash. A matching pair cannot erase previously transferred claims."],["spec/annual-series-accounting.md","planning/program-review.md"]);
}

// 6 — New Solana graphic adapted to the deck's wide canvas
{
 const s=p.slides.add(); header(s,6,"Why Solana");
 text(s,">95%",80,201,545,128,106,C.blue,true,{lineSpacing:1});
 text(s,"of tokenized-equity trading",82,350,525,45,29,C.ink,true);
 text(s,"Solana reached this share during Q2 2026.",82,404,520,76,25,C.muted,false,{lineSpacing:1.12});
 const illustration=await fs.readFile(COMPOSABILITY_ASSET);
 s.images.add({blob:illustration,contentType:"image/png",alt:"Stock and dividend claims each connect to wallets and trading applications",fit:"contain",position:{left:664,top:174,width:515,height:382}});
 text(s,"Two assets for Solana builders",667,555,510,37,25,C.ink,true);
 text(s,"Fast settlement · Fractional positions · Auditable",80,613,1120,38,26,C.ink,true);
 text(s,"Galaxy Research · Q2 2026 report · A level reached, not a quarterly average.",80,665,1120,25,15,C.muted);
 notes(s,"",["The metric is tokenized-equity trading share reached during Q2 2026. It is not total RWA liquidity, a quarter average, or current market share. Auditability means visible program records, not audit certification or proof of issuer reserves. Asset composition follows the approved why-Solana social illustration while keeping slide text editable."],["https://www.galaxy.com/insights/research/solana-q2-2026-report-tokenized-economy-dex-rwa-stablecoins","design/illustrations/social/why-solana-v1.jpg","design/illustrations/assets/stock-and-dividend-composability-v1.png"]);
}

// 7 — A compact ecosystem view
{
 const s=p.slides.add(); header(s,7,"Both sides are composable");
 text(s,"PT for stock exposure. DR for dividend rights.",80,184,1120,44,27,C.ink,true);
 const rows=[
 ["Liquidity markets","Raydium tested. Meteora proposed.",C.blue],
 ["Routing and orders","Jupiter: aggregation, recurring buys and limit orders.",C.ink],
 ["Sales and vesting","Streamflow escrow and vesting; Jupiter Lock.",C.amberInk],
 ["Treasuries and strategies","Squads multisig; dividend baskets and rolling strategies.",C.ink]
 ];
 rows.forEach((r,i)=>{const y=263+i*81;text(s,r[0],80,y,465,50,24,r[2],true);text(s,r[1],575,y,610,57,22,C.muted,false,{lineSpacing:1.14});rule(s,80,y+64,1110);});
 text(s,"Lending later: reliable prices, liquidity and maturity rules first.",80,613,1120,33,24,C.ink,true);
 text(s,"Beyond Raydium, these are proposed uses, subject to protocol compatibility and market support.",80,664,1120,27,15,C.muted);
 notes(s,"",["No partnerships, mainnet markets or automatic listings are implied. Test Raydium execution is proved separately on public devnet and captured-program private chains. Other named integrations remain proposed, not implemented. Jupiter routing/orders need eligible venues and liquidity. Rolling products must change annual vintages; a DCA cannot reopen closed issuance. Locking schedules token delivery, not DivX dividend accrual. Treasury support requires client and mint compatibility."],["planning/amm-review.md","presentation/divx-article-draft.md","planning/research/defi-demo-sequence.md","https://docs.meteora.ag/","https://support.jup.ag/","https://lock.jup.ag/","https://docs.streamflow.finance/en/articles/11514590-create-an-order","https://docs.squads.so/main/getting-started/treasury-management-overview"]);
}

// 8 — Actual product, rather than the historical calculator
{
 const s=p.slides.add(); header(s,8,"A working guided demo");
 const bytes=await fs.readFile(path.join(workspaceDir,"assets/screenshots/demos-preview-divx-v1.jpg"));
 s.images.add({blob:bytes,contentType:"image/jpeg",alt:"DivX guided demo landing page: One stock, two separate tokens",fit:"contain",position:{left:60,top:211,width:786,height:413}});
 const rows=[["01","Split and recombine"],["02","See dividends build up"],["03","Trade DR and redeem"]];
 rows.forEach((r,i)=>{const y=222+i*104; label(s,r[0],889,y,270,C.blueInk);text(s,r[1],889,y+29,308,63,26,C.ink,true,{lineSpacing:1.08});});
 text(s,"Selected stock profiles from\nOndo · Backpack · xStocks",889,554,310,72,21,C.muted,false,{lineSpacing:1.22});
 text(s,"Public devnet: real calendar. Guided sandbox: accelerated year. Both use test assets.",80,661,1120,30,18,C.muted);
 notes(s,"",["The public devnet series remains on real 2027 calendar time; independent redemption is not available until maturity and finalization. The guided tour executes actual program instructions on an isolated private chain with synthetic balances/events and captured Raydium bytecode. Fifteen synthetic issuer-specific profiles span six companies; these are not real mainnet issuer mints. No selected issuer is qualified for live custody/settlement. Preview screenshot is existing approved product imagery, not fresh transaction proof."],["https://divx.payai.network/demos/","https://divx.payai.network/app/","https://solscan.io/account/2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE?cluster=devnet","planning/mainnet-readiness-2026-09-20.md","planning/guided-lazy-entry-review-2026-09-21.md"]);
}

// 9 — Honest next steps and a simple call to action
{
 const s=p.slides.add(); header(s,9,"From prototype to mainnet");
 label(s,"Working today",80,198,520,C.blueInk);
 text(s,"Annual program and SDK\nPublic devnet app\nGuided split, trade and redemption",80,242,540,163,29,C.ink,true,{lineSpacing:1.28});
 rule(s,646,195,1,C.line,215);
 label(s,"Before real assets",700,198,490,C.amberInk);
 text(s,"Qualified issuer records\nVerified custody and payouts\nSecurity and legal review",700,242,492,163,28,C.ink,true,{lineSpacing:1.28});
 text(s,"Then: more liquidity, rolling dividend strategies and other networks.",80,466,1105,63,25,C.muted,false,{lineSpacing:1.16});
 rule(s,80,553,1110);
 text(s,"Try DivX",80,583,460,57,38,C.ink,true);
 text(s,"divx.payai.network",632,585,555,49,33,C.blue,true);
 text(s,"Stocklana hackathon · No wallet or real funds needed for the guided demo.",80,658,1110,30,18,C.muted);
 notes(s,"",["Mainnet requires explicit custody admission, complete qualified event feeds, attestor governance, corrections and incident policy, independent security review, monitoring, issuer-term/legal review, and liquidity. Current software is a tested prototype, not a live issuer settlement service. Named issuer families are selected research/test scope, not endorsements."],["planning/mainnet-readiness-2026-09-20.md","https://divx.payai.network/","https://github.com/notorious-d-e-v/dividendx-stocklana","https://hackathons.solana.com/hackathons/stocklana"]);
}

const stagingDir=path.join(TMP_DIR,"finalizer");
await fs.mkdir(stagingDir,{recursive:true});
const candidatePath=path.join(stagingDir,"DivX-illustrated-v3-candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const requirements={explicitTotalSlideCount:9,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[]};
const result=await finalizePresentation({
 ...requirements,workspaceDir,candidatePath,finalPath:FINAL_PPTX,pythonExecutable:RUNTIME_PYTHON,
 integrityValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_package_integrity.py"),
 layoutValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_layout_geometry.py"),
 layoutArgs:["--expected-slide-size-emu","12192000,6858000","--validate-heading-fit"],
 fontPolicy:{basis:"reference",families:[font],referencePath:path.join(workspaceDir,"output/DivX-illustrated-v2.pptx"),referenceSha256:"7e6b226552a0162f5f0f527ca806a3abc15af776c18f10c807993dae4474be1c"},verifyArtifactToolImport:true,
 receiptPath:path.join(stagingDir,"DivX-Stocklana-2026.validation.json")
});
console.log(JSON.stringify({font,candidatePath,finalPath:FINAL_PPTX,result},null,2));

const previewDir=path.join(workspaceDir,"output","illustrated-v3");
await fs.mkdir(previewDir,{recursive:true});
for(let i=0;i<p.slides.items.length;i++){
 const png=await p.export({slide:p.slides.items[i],format:"png",scale:1.5});
 await fs.writeFile(path.join(previewDir,`slide-${i+1}.png`),new Uint8Array(await png.arrayBuffer()));
}
