export const SEASON_DURATION_MS = 60_000;

// Atmosphere-only backgrounds: no people, animals, vehicles, buildings or scene props.
// Every one-minute season has multiple ambient effects so the background stays alive
// without competing with the verified sales score.
export const seasonAtmospheres = [
  {
    id:'spring-bloom', name:'SPRING · BLOOM', meta:'ฤดูใบไม้ผลิ · แสงเช้า', fx:['petals','mist','sparkle'],
    sky1:'#8fcfff', sky2:'#e4efff', glow:'#ffd4e5', ground:'#668f72', accent:'#ffabc7'
  },
  {
    id:'summer-clear', name:'SUMMER · CLEAR', meta:'ฤดูร้อน · ฟ้าใส', fx:['heat','cloud-glow','sparkle'],
    sky1:'#52bfff', sky2:'#c8efff', glow:'#ffe49a', ground:'#548e68', accent:'#ffe078'
  },
  {
    id:'summer-golden', name:'SUMMER · GOLDEN', meta:'ฤดูร้อน · แสงเย็น', fx:['sunset','heat','sparkle'],
    sky1:'#547fc4', sky2:'#f0a060', glow:'#ffc068', ground:'#68715b', accent:'#ffb75e'
  },
  {
    id:'monsoon', name:'MONSOON · RAIN', meta:'มรสุม · ฝน', fx:['rain','mist','cloud-glow'],
    sky1:'#293e53', sky2:'#647d91', glow:'#a3c7db', ground:'#304c59', accent:'#9fdcff'
  },
  {
    id:'tropical-rain', name:'TROPICAL · RAIN', meta:'ฤดูฝนเขตร้อน', fx:['rain-soft','mist','sparkle'],
    sky1:'#315865', sky2:'#7fa49f', glow:'#b6ddd2', ground:'#396651', accent:'#93e4cd'
  },
  {
    id:'tropical-dry', name:'TROPICAL · DRY', meta:'ฤดูแล้งเขตร้อน', fx:['dry','cloud-glow','sparkle'],
    sky1:'#65add6', sky2:'#efbf87', glow:'#ffd18b', ground:'#827254', accent:'#ffca78'
  },
  {
    id:'autumn-gold', name:'AUTUMN · GOLD', meta:'ฤดูใบไม้ร่วง · สีทอง', fx:['leaves','sunset','mist'],
    sky1:'#7089a5', sky2:'#dc9958', glow:'#ffc16a', ground:'#775033', accent:'#e79442'
  },
  {
    id:'autumn-rain', name:'AUTUMN · RAIN', meta:'ปลายฤดูใบไม้ร่วง · ฝนบาง', fx:['rain-soft','mist','leaves'],
    sky1:'#4c6072', sky2:'#8c9295', glow:'#c3baad', ground:'#50473f', accent:'#c7a375'
  },
  {
    id:'winter-first', name:'WINTER · FIRST SNOW', meta:'ต้นฤดูหนาว · หิมะแรก', fx:['snow-soft','mist','frost'],
    sky1:'#87a7c0', sky2:'#d8e5ed', glow:'#e5f6ff', ground:'#a0b5c0', accent:'#d4f2ff'
  },
  {
    id:'winter-deep', name:'WINTER · DEEP', meta:'ฤดูหนาว · หิมะ', fx:['snow','frost','cloud-glow'],
    sky1:'#506c84', sky2:'#b5cad8', glow:'#d9f1ff', ground:'#829aa7', accent:'#d2f0ff'
  },
  {
    id:'frost-dawn', name:'FROST · DAWN', meta:'รุ่งเช้าเยือกแข็ง', fx:['frost','mist','sparkle'],
    sky1:'#4a6288', sky2:'#d2a39c', glow:'#ffe2cb', ground:'#8494a7', accent:'#f3d0c2'
  },
  {
    id:'polar-twilight', name:'POLAR · TWILIGHT', meta:'ฤดูหนาวขั้วโลก · แสงเหนือ', fx:['aurora','stars','snow-soft'],
    sky1:'#09162e', sky2:'#213657', glow:'#68dfbd', ground:'#21333f', accent:'#75efca'
  }
];

export const SEASON_COUNT = seasonAtmospheres.length;
