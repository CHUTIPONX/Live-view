export const WORLD_SCENE_DURATION_MS = 60_000;

export const worldScenes = [
  {
    id:'kyoto-spring', name:'KYOTO · SPRING MORNING', location:'Kyoto, Japan', season:'Spring', time:'Morning',
    landscape:'village', effects:['petals','breeze'],
    palette:{sky1:'#8fc8ee',sky2:'#f8c7d7',horizon:'#ffd8c7',ground:'#4d7c58',accent:'#ff95b5'},
    actors:[
      {type:'person-walk',x:24,y:78,scale:.78,speed:18,delay:1},
      {type:'photographer',x:63,y:76,scale:.72,speed:9,delay:5},
      {type:'cat-tail',x:78,y:84,scale:.60,speed:5,delay:2},
      {type:'bird',x:15,y:24,scale:.62,speed:12,delay:2},
      {type:'bird',x:22,y:20,scale:.48,speed:14,delay:4}
    ]
  },
  {
    id:'tokyo-summer-night', name:'TOKYO · SUMMER NIGHT', location:'Tokyo, Japan', season:'Summer', time:'Night',
    landscape:'city', effects:['cityGlow','fireflies'],
    palette:{sky1:'#071126',sky2:'#2b174b',horizon:'#ef6fae',ground:'#101827',accent:'#67e7ff'},
    actors:[
      {type:'person-walk',x:18,y:82,scale:.72,speed:16,delay:1},
      {type:'person-walk',x:72,y:81,scale:.66,speed:14,delay:6,flip:true},
      {type:'car',x:8,y:87,scale:.74,speed:10,delay:2},
      {type:'train',x:52,y:62,scale:.82,speed:13,delay:4}
    ]
  },
  {
    id:'hokkaido-winter', name:'HOKKAIDO · DEEP WINTER', location:'Hokkaido, Japan', season:'Winter', time:'Morning',
    landscape:'snowVillage', effects:['snow','chimney'],
    palette:{sky1:'#9ab8cf',sky2:'#e5eff5',horizon:'#f8d8c3',ground:'#dbe7ef',accent:'#82b8d8'},
    actors:[
      {type:'coat-person',x:28,y:80,scale:.74,speed:15,delay:1},
      {type:'dog-curl',x:70,y:84,scale:.58,speed:6,delay:3},
      {type:'bird-perch',x:83,y:50,scale:.46,speed:5,delay:4}
    ]
  },
  {
    id:'bangkok-monsoon', name:'BANGKOK · MONSOON EVENING', location:'Bangkok, Thailand', season:'Monsoon', time:'Evening',
    landscape:'city', effects:['rain','wetRoad','lightningSoft'],
    palette:{sky1:'#26334b',sky2:'#5f6c83',horizon:'#dc8e76',ground:'#182231',accent:'#75c9ff'},
    actors:[
      {type:'umbrella-person',x:26,y:81,scale:.78,speed:15,delay:1},
      {type:'umbrella-person',x:65,y:82,scale:.68,speed:17,delay:7,flip:true},
      {type:'car',x:4,y:88,scale:.82,speed:9,delay:3},
      {type:'cat-shelter',x:85,y:84,scale:.52,speed:4,delay:2}
    ]
  },
  {
    id:'thai-hot-season', name:'THAILAND · HOT SEASON', location:'Northern Thailand', season:'Hot season', time:'Afternoon',
    landscape:'rural', effects:['heat','breeze'],
    palette:{sky1:'#75c7ee',sky2:'#ffd38b',horizon:'#ffbd69',ground:'#6f8d47',accent:'#ffe27c'},
    actors:[
      {type:'person-rest',x:34,y:82,scale:.90,speed:7,delay:0},
      {type:'dog-pant',x:63,y:84,scale:.66,speed:4,delay:1},
      {type:'cow-drink',x:78,y:79,scale:.72,speed:8,delay:2},
      {type:'bird',x:20,y:26,scale:.55,speed:13,delay:6}
    ]
  },
  {
    id:'bali-tropical', name:'BALI · TROPICAL MORNING', location:'Bali, Indonesia', season:'Tropical', time:'Morning',
    landscape:'riceTerrace', effects:['mist','butterflies'],
    palette:{sky1:'#8fd5e7',sky2:'#d8f0c5',horizon:'#f5d59b',ground:'#3f874e',accent:'#74d477'},
    actors:[
      {type:'hiker',x:31,y:78,scale:.72,speed:15,delay:2},
      {type:'bird',x:67,y:25,scale:.55,speed:13,delay:3},
      {type:'butterfly',x:75,y:63,scale:.42,speed:8,delay:4}
    ]
  },
  {
    id:'swiss-alps-spring', name:'SWISS ALPS · SPRING', location:'Swiss Alps', season:'Spring', time:'Morning',
    landscape:'alps', effects:['mist','flowers'],
    palette:{sky1:'#82c8f1',sky2:'#d9effb',horizon:'#ffe0aa',ground:'#4c8a45',accent:'#ffe668'},
    actors:[
      {type:'cow-graze',x:27,y:82,scale:.72,speed:8,delay:2},
      {type:'cow-graze',x:72,y:84,scale:.60,speed:9,delay:6,flip:true},
      {type:'photographer',x:49,y:75,scale:.66,speed:8,delay:4},
      {type:'bird',x:19,y:20,scale:.52,speed:12,delay:3}
    ]
  },
  {
    id:'amalfi-summer', name:'AMALFI · SUMMER COAST', location:'Amalfi Coast, Italy', season:'Summer', time:'Noon',
    landscape:'coastTown', effects:['sunSparkle','breeze'],
    palette:{sky1:'#63c6ef',sky2:'#bce8f8',horizon:'#fff0b2',ground:'#185c73',accent:'#ffcc58'},
    actors:[
      {type:'boat',x:22,y:77,scale:.72,speed:12,delay:1},
      {type:'boat',x:70,y:72,scale:.54,speed:15,delay:6,flip:true},
      {type:'seagull',x:45,y:24,scale:.50,speed:11,delay:3},
      {type:'person-walk',x:82,y:82,scale:.64,speed:17,delay:2}
    ]
  },
  {
    id:'paris-autumn-rain', name:'PARIS · AUTUMN RAIN', location:'Paris, France', season:'Autumn', time:'Evening',
    landscape:'europeCity', effects:['rain','leaves','wetRoad'],
    palette:{sky1:'#586070',sky2:'#9d887b',horizon:'#e2a266',ground:'#3c3533',accent:'#e48a43'},
    actors:[
      {type:'umbrella-person',x:24,y:82,scale:.76,speed:16,delay:2},
      {type:'bike',x:66,y:84,scale:.62,speed:12,delay:4},
      {type:'bird-perch',x:83,y:46,scale:.45,speed:6,delay:7}
    ]
  },
  {
    id:'norway-fjord', name:'NORWAY · FJORD SUMMER', location:'Norway', season:'Summer', time:'Late evening',
    landscape:'fjord', effects:['mist','waterGlow'],
    palette:{sky1:'#74a9d8',sky2:'#e2b49c',horizon:'#f9c579',ground:'#294f55',accent:'#8be0d1'},
    actors:[
      {type:'hiker',x:18,y:76,scale:.70,speed:14,delay:3},
      {type:'boat',x:63,y:76,scale:.60,speed:15,delay:2},
      {type:'seagull',x:47,y:22,scale:.50,speed:12,delay:6}
    ]
  },
  {
    id:'iceland-aurora', name:'ICELAND · AURORA WINTER', location:'Iceland', season:'Winter', time:'Polar night',
    landscape:'aurora', effects:['aurora','snowLight','stars'],
    palette:{sky1:'#071426',sky2:'#153447',horizon:'#2b665e',ground:'#112632',accent:'#66f0c4'},
    actors:[
      {type:'coat-person',x:30,y:81,scale:.70,speed:9,delay:2},
      {type:'deer',x:76,y:82,scale:.62,speed:12,delay:5},
      {type:'bird',x:55,y:25,scale:.42,speed:13,delay:4}
    ]
  },
  {
    id:'new-york-autumn', name:'NEW YORK · AUTUMN SUNSET', location:'New York, USA', season:'Autumn', time:'Sunset',
    landscape:'skyline', effects:['leaves','cityGlow'],
    palette:{sky1:'#4d5e8a',sky2:'#e58c6a',horizon:'#ffbf65',ground:'#182333',accent:'#ff865a'},
    actors:[
      {type:'jogger',x:20,y:84,scale:.68,speed:12,delay:2},
      {type:'person-walk',x:72,y:83,scale:.65,speed:15,delay:7,flip:true},
      {type:'taxi',x:5,y:88,scale:.78,speed:9,delay:4},
      {type:'bird',x:44,y:24,scale:.45,speed:12,delay:1}
    ]
  },
  {
    id:'banff-winter', name:'BANFF · WINTER LAKE', location:'Alberta, Canada', season:'Winter', time:'Morning',
    landscape:'frozenLake', effects:['snow','mist'],
    palette:{sky1:'#94bfd8',sky2:'#dcebf3',horizon:'#f0d3c7',ground:'#b9d0dd',accent:'#9ed9f0'},
    actors:[
      {type:'deer',x:24,y:82,scale:.68,speed:11,delay:2},
      {type:'coat-person',x:70,y:80,scale:.66,speed:15,delay:6},
      {type:'bird-perch',x:84,y:52,scale:.42,speed:6,delay:4}
    ]
  },
  {
    id:'california-desert', name:'CALIFORNIA · DESERT HEAT', location:'California, USA', season:'Dry summer', time:'Afternoon',
    landscape:'desertRoad', effects:['heat','dust'],
    palette:{sky1:'#6cc3ec',sky2:'#ffd278',horizon:'#f6a14f',ground:'#b86c3a',accent:'#ffdc6c'},
    actors:[
      {type:'person-rest',x:22,y:82,scale:.88,speed:7,delay:1},
      {type:'car-parked',x:42,y:85,scale:.88,speed:6,delay:2},
      {type:'bird',x:74,y:24,scale:.50,speed:14,delay:5}
    ]
  },
  {
    id:'caribbean-beach', name:'CARIBBEAN · TROPICAL BEACH', location:'Caribbean', season:'Tropical summer', time:'Noon',
    landscape:'beach', effects:['sunSparkle','palms'],
    palette:{sky1:'#5bd0f1',sky2:'#c8f4ff',horizon:'#fff0a6',ground:'#1f9bb2',accent:'#ffd96b'},
    actors:[
      {type:'sunbather',x:29,y:84,scale:.86,speed:6,delay:1},
      {type:'dog-pant',x:57,y:85,scale:.56,speed:5,delay:4},
      {type:'seagull',x:68,y:22,scale:.52,speed:11,delay:3},
      {type:'boat',x:80,y:73,scale:.50,speed:15,delay:6}
    ]
  },
  {
    id:'patagonia-spring', name:'PATAGONIA · WINDY SPRING', location:'Patagonia, Argentina', season:'Spring', time:'Morning',
    landscape:'mountainPlain', effects:['wind','clouds'],
    palette:{sky1:'#78b4da',sky2:'#d5e8ee',horizon:'#f1d5af',ground:'#657754',accent:'#9cc8af'},
    actors:[
      {type:'hiker',x:31,y:80,scale:.72,speed:13,delay:2},
      {type:'guanaco',x:72,y:82,scale:.66,speed:11,delay:4},
      {type:'bird',x:52,y:22,scale:.46,speed:12,delay:6}
    ]
  },
  {
    id:'amazon-rain', name:'AMAZON · RAINY SEASON', location:'Amazon Rainforest, Brazil', season:'Rainy season', time:'Afternoon',
    landscape:'rainforest', effects:['rain','mist','fireflies'],
    palette:{sky1:'#395a59',sky2:'#6f8c72',horizon:'#93a66c',ground:'#1c4a35',accent:'#71d98a'},
    actors:[
      {type:'frog',x:25,y:86,scale:.52,speed:5,delay:3},
      {type:'butterfly',x:63,y:64,scale:.44,speed:8,delay:5},
      {type:'bird',x:76,y:28,scale:.52,speed:12,delay:2}
    ]
  },
  {
    id:'sahara-sunset', name:'SAHARA · DRY SEASON SUNSET', location:'Sahara Desert', season:'Dry season', time:'Sunset',
    landscape:'desert', effects:['dust','heat'],
    palette:{sky1:'#7a4776',sky2:'#ec825d',horizon:'#ffc56d',ground:'#bf713f',accent:'#ffd27b'},
    actors:[
      {type:'camel',x:28,y:81,scale:.82,speed:15,delay:1},
      {type:'traveler',x:45,y:80,scale:.68,speed:16,delay:2},
      {type:'camel',x:64,y:83,scale:.68,speed:17,delay:5},
      {type:'bird',x:78,y:23,scale:.46,speed:14,delay:4}
    ]
  },
  {
    id:'serengeti-dry', name:'SERENGETI · GOLDEN DRY SEASON', location:'Tanzania', season:'Dry season', time:'Golden hour',
    landscape:'savanna', effects:['dust','warmGlow'],
    palette:{sky1:'#78a9ca',sky2:'#efab68',horizon:'#ffd16e',ground:'#a77b38',accent:'#f0bf50'},
    actors:[
      {type:'elephant',x:23,y:80,scale:.74,speed:13,delay:1},
      {type:'giraffe',x:67,y:75,scale:.76,speed:14,delay:5},
      {type:'safari',x:44,y:85,scale:.64,speed:10,delay:7},
      {type:'bird',x:54,y:22,scale:.50,speed:12,delay:3}
    ]
  },
  {
    id:'cape-town-spring', name:'CAPE TOWN · SPRING COAST', location:'Cape Town, South Africa', season:'Spring', time:'Afternoon',
    landscape:'coastMountain', effects:['breeze','clouds'],
    palette:{sky1:'#6ab9e7',sky2:'#d9eef8',horizon:'#efce9a',ground:'#37666c',accent:'#ffca73'},
    actors:[
      {type:'jogger',x:24,y:84,scale:.68,speed:12,delay:2},
      {type:'seagull',x:70,y:24,scale:.52,speed:11,delay:4},
      {type:'boat',x:77,y:73,scale:.50,speed:15,delay:7}
    ]
  },
  {
    id:'dubai-evening', name:'DUBAI · HOT EVENING', location:'Dubai, UAE', season:'Hot season', time:'Evening',
    landscape:'modernCity', effects:['heat','cityGlow'],
    palette:{sky1:'#446699',sky2:'#e98b6f',horizon:'#ffc56f',ground:'#252b3a',accent:'#ffd36e'},
    actors:[
      {type:'car',x:6,y:88,scale:.88,speed:8,delay:2},
      {type:'person-walk',x:72,y:82,scale:.66,speed:16,delay:4},
      {type:'plane',x:58,y:18,scale:.44,speed:15,delay:5}
    ]
  },
  {
    id:'sydney-summer', name:'SYDNEY · SUMMER HARBOUR', location:'Sydney, Australia', season:'Summer', time:'Morning',
    landscape:'harbour', effects:['sunSparkle','breeze'],
    palette:{sky1:'#63bfe9',sky2:'#d6f2fb',horizon:'#ffe2a7',ground:'#297c9a',accent:'#ffd06d'},
    actors:[
      {type:'jogger',x:19,y:84,scale:.66,speed:12,delay:2},
      {type:'boat',x:58,y:76,scale:.60,speed:13,delay:3},
      {type:'seagull',x:76,y:22,scale:.50,speed:11,delay:6}
    ]
  },
  {
    id:'new-zealand-spring', name:'NEW ZEALAND · SPRING MEADOW', location:'South Island, New Zealand', season:'Spring', time:'Morning',
    landscape:'meadow', effects:['flowers','clouds'],
    palette:{sky1:'#78bee6',sky2:'#dff1f5',horizon:'#f7daa7',ground:'#5d8f4c',accent:'#ffe96f'},
    actors:[
      {type:'sheep',x:27,y:82,scale:.64,speed:9,delay:1},
      {type:'sheep',x:63,y:84,scale:.56,speed:10,delay:5,flip:true},
      {type:'hiker',x:78,y:78,scale:.62,speed:15,delay:3},
      {type:'bird',x:45,y:22,scale:.46,speed:12,delay:7}
    ]
  },
  {
    id:'lapland-polar', name:'LAPLAND · POLAR WINTER NIGHT', location:'Finnish Lapland', season:'Polar winter', time:'Night',
    landscape:'auroraCabin', effects:['aurora','snowLight','stars','chimney'],
    palette:{sky1:'#061424',sky2:'#17364b',horizon:'#28594d',ground:'#cbdbe4',accent:'#68f2c7'},
    actors:[
      {type:'reindeer',x:28,y:81,scale:.68,speed:12,delay:2},
      {type:'coat-person',x:73,y:80,scale:.64,speed:14,delay:5},
      {type:'bird-perch',x:83,y:48,scale:.42,speed:6,delay:6}
    ]
  },
];

export const WORLD_SCENE_COUNT = worldScenes.length;
