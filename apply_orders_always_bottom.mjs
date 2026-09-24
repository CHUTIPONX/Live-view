import fs from 'node:fs';

const cssPath='public/style.css';
if(!fs.existsSync(cssPath))throw new Error('Run this from the Live-view project root.');

let css=fs.readFileSync(cssPath,'utf8');
const marker='/* v3.1 — LIVE ORDERS ALWAYS BOTTOM */';

if(!css.includes(marker)){
  css += `

${marker}

/* Force the dashboard into one vertical column on every screen size.
   Because LIVE ORDERS comes after .sales-core in the HTML, it will always
   stay underneath the main sales section and never jump to the right again. */
.sales-layout{
  width:100%!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:18px!important;
}

.sales-core{
  width:100%!important;
  min-width:0!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
}

.live-orders{
  order:2!important;
  width:100%!important;
  max-width:none!important;
  min-width:0!important;
  max-height:none!important;
  margin:0!important;
}

.stage-foot{
  width:100%!important;
  padding-right:0!important;
}

/* Wide computer screens: 5 cards in one row. */
@media(min-width:1181px){
  .live-order-list{
    width:100%!important;
    height:auto!important;
    max-height:none!important;
    display:grid!important;
    grid-template-columns:repeat(5,minmax(0,1fr))!important;
    grid-template-rows:1fr!important;
    gap:9px!important;
    overflow:visible!important;
    padding-top:9px!important;
  }

  .live-order.live-order-simple{
    min-width:0!important;
    min-height:92px!important;
  }
}

/* Smaller laptops / narrow desktop windows:
   still bottom, but horizontally scroll the order cards instead of
   ever moving the whole LIVE ORDERS block to the side. */
@media(min-width:701px) and (max-width:1180px){
  .live-orders{
    width:100%!important;
    max-height:none!important;
  }

  .live-order-list{
    width:100%!important;
    display:flex!important;
    flex-wrap:nowrap!important;
    gap:8px!important;
    max-height:none!important;
    overflow-x:auto!important;
    overflow-y:hidden!important;
    scrollbar-width:thin!important;
    padding-bottom:5px!important;
  }

  .live-order.live-order-simple{
    flex:0 0 270px!important;
    min-height:108px!important;
  }
}

/* Phones remain bottom as well. */
@media(max-width:700px){
  .sales-layout{
    gap:14px!important;
  }

  .live-orders{
    width:100%!important;
  }

  .live-order-list{
    display:flex!important;
    flex-wrap:nowrap!important;
    overflow-x:auto!important;
    overflow-y:hidden!important;
  }
}
`;
}

fs.writeFileSync(cssPath,css,'utf8');
console.log('ORDERS ALWAYS BOTTOM: PASS');
console.log('LIVE ORDERS is now forced below the sales area on every screen size.');
