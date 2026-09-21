export const SEASON_DURATION_MS = 60_000;

// Seasonal atmosphere only: no people, animals, vehicles, buildings or decorative scene props.
// The browser switches one atmosphere per minute and loops through the set.
export const seasonAtmospheres = [
  {
    id:'spring-bloom', name:'SPRING · BLOOM', meta:'ฤดูใบไม้ผลิ · แสงเช้า', fx:'petals',
    sky1:'#9fd8ff', sky2:'#d9ecff', glow:'#ffd9e6', ground:'#749b75', accent:'#ffb2c9'
  },
  {
    id:'summer-clear', name:'SUMMER · CLEAR', meta:'ฤดูร้อน · ฟ้าใส', fx:'heat',
    sky1:'#63c8ff', sky2:'#c9efff', glow:'#ffe59a', ground:'#5f966a', accent:'#ffe07a'
  },
  {
    id:'summer-golden', name:'SUMMER · GOLDEN', meta:'ฤดูร้อน · แสงเย็น', fx:'sunset',
    sky1:'#5a8fd4', sky2:'#f2a367', glow:'#ffc66f', ground:'#6c7861', accent:'#ffbc6a'
  },
  {
    id:'monsoon', name:'MONSOON · RAIN', meta:'มรสุม · ฝน', fx:'rain',
    sky1:'#31475d', sky2:'#6b8498', glow:'#a8c8db', ground:'#385461', accent:'#a8ddff'
  },
  {
    id:'tropical-rain', name:'TROPICAL · RAIN', meta:'ฤดูฝนเขตร้อน', fx:'rain-soft',
    sky1:'#365b68', sky2:'#81a8a2', glow:'#bbded4', ground:'#3f6c58', accent:'#9ce6d0'
  },
  {
    id:'tropical-dry', name:'TROPICAL · DRY', meta:'ฤดูแล้งเขตร้อน', fx:'dry',
    sky1:'#6fb5dc', sky2:'#f1c58f', glow:'#ffd590', ground:'#88795a', accent:'#ffd081'
  },
  {
    id:'autumn-gold', name:'AUTUMN · GOLD', meta:'ฤดูใบไม้ร่วง · สีทอง', fx:'leaves',
    sky1:'#7894b1', sky2:'#e0a15f', glow:'#ffc76f', ground:'#805737', accent:'#e99b4a'
  },
  {
    id:'autumn-rain', name:'AUTUMN · RAIN', meta:'ปลายฤดูใบไม้ร่วง · ฝนบาง', fx:'mist',
    sky1:'#536678', sky2:'#93989a', glow:'#c8c0b2', ground:'#574d43', accent:'#cfaa7c'
  },
  {
    id:'winter-first', name:'WINTER · FIRST SNOW', meta:'ต้นฤดูหนาว · หิมะแรก', fx:'snow-soft',
    sky1:'#8faec6', sky2:'#dce7ef', glow:'#eaf7ff', ground:'#a7bbc5', accent:'#d9f4ff'
  },
  {
    id:'winter-deep', name:'WINTER · DEEP', meta:'ฤดูหนาว · หิมะ', fx:'snow',
    sky1:'#557189', sky2:'#b9cedc', glow:'#dff4ff', ground:'#879eaa', accent:'#d7f3ff'
  },
  {
    id:'frost-dawn', name:'FROST · DAWN', meta:'รุ่งเช้าเยือกแข็ง', fx:'frost',
    sky1:'#4f668c', sky2:'#d6a8a0', glow:'#ffe6ce', ground:'#8998aa', accent:'#f7d5c5'
  },
  {
    id:'polar-twilight', name:'POLAR · TWILIGHT', meta:'ฤดูหนาวขั้วโลก · แสงเหนือ', fx:'aurora',
    sky1:'#0c1831', sky2:'#25395f', glow:'#6de5c2', ground:'#263745', accent:'#7cf5d1'
  }
];

export const SEASON_COUNT = seasonAtmospheres.length;
