import fs from 'node:fs';

const cssPath='public/style.css';
if(!fs.existsSync(cssPath))throw new Error('Run this from the Live-view project root.');
let css=fs.readFileSync(cssPath,'utf8');

const marker='/* v1.9.7 — desktop live orders bottom bar */';
if(!css.includes(marker)){
  css += `

${marker}
@media(min-width:1181px){
  /* Keep the sales number as the visual hero on desktop. */
  .sales-layout{
    width:100%;
    display:grid;
    grid-template-columns:minmax(0,1fr);
    grid-template-rows:auto auto;
    gap:22px;
    align-items:stretch;
  }

  .sales-core{
    width:100%;
    min-width:0;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
  }

  .history-label,
  .history{
    width:min(860px,100%);
  }

  /* Latest orders become a full-width horizontal dock under the sales core. */
  .live-orders{
    width:100%;
    max-width:none;
    max-height:none;
    padding:14px 16px 15px;
    border-radius:22px;
  }

  .live-orders-head{
    height:34px;
    padding:0 2px 8px;
    align-items:center;
  }

  .live-order-list{
    width:100%;
    height:auto;
    max-height:none;
    display:grid;
    grid-template-columns:repeat(5,minmax(0,1fr));
    grid-template-rows:1fr;
    gap:9px;
    padding-top:9px;
    overflow:visible;
  }

  .live-order.live-order-simple{
    min-width:0;
    min-height:92px;
    padding:12px 13px;
    grid-template-columns:minmax(0,1fr) auto;
    align-items:center;
    gap:10px;
  }

  .live-order-copy{
    min-width:0;
  }

  .live-shop-name{
    font-size:13px;
  }

  .live-product-name{
    font-size:11.5px;
  }

  .live-product-code{
    font-size:10px;
  }

  .live-order-price{
    font-size:20px;
  }

  .live-order-clock{
    font-size:8.5px;
  }

  .stage-foot{
    width:100%;
    padding-right:0;
  }
}

@media(min-width:1181px) and (max-width:1320px){
  .live-order-list{
    grid-template-columns:repeat(5,minmax(190px,1fr));
    overflow-x:auto;
    overflow-y:hidden;
    scrollbar-width:thin;
    padding-bottom:4px;
  }
}
`;
}

fs.writeFileSync(cssPath,css,'utf8');
console.log('DESKTOP ORDER BAR PATCH: PASS');
console.log('Desktop: Latest 5 moved below the main sales area.');
console.log('Mobile/tablet: existing layout preserved.');
