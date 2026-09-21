import { reportPlan } from '../lib/handlers.mjs';
import { sendNode } from '../lib/vercel.mjs';

export default async function handler(req,res){
  if(req.method!=='GET') return sendNode(res,{status:405,headers:{allow:'GET'},body:'Method Not Allowed'});
  const url=new URL(req.url||'/api/report-plan','http://localhost');
  return sendNode(res,await reportPlan({headers:req.headers||{},query:Object.fromEntries(url.searchParams),body:{}}));
}
