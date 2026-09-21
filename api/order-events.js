import { orderEvents } from '../lib/handlers.mjs';
import { readJsonBody, sendNode } from '../lib/vercel.mjs';

export default async function handler(req,res){
  if(req.method!=='POST') return sendNode(res,{status:405,headers:{allow:'POST'},body:'Method Not Allowed'});
  const body=await readJsonBody(req);
  return sendNode(res,await orderEvents({headers:req.headers||{},body,query:{}}));
}
