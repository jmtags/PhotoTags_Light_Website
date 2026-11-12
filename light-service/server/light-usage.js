const text=(value,max=160)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
function normalize(data){
 if(!data||!['settings','kiosk'].includes(data.mode)||!data.device||!['Desktop','Tablet','Mobile','Unknown'].includes(data.device.type))throw new Error('invalid_light_usage');
 const camera={active:data.camera?.active===true};
 if(text(data.camera?.label))camera.label=text(data.camera.label);
 for(const key of ['width','height'])if(Number.isInteger(data.camera?.[key])&&data.camera[key]>0&&data.camera[key]<=16384)camera[key]=data.camera[key];
 if(['user','environment','left','right'].includes(data.camera?.facingMode))camera.facingMode=data.camera.facingMode;
 return {mode:data.mode,device:{type:data.device.type,os:text(data.device.os,40)||'Unknown',browser:text(data.device.browser,60)||'Unknown',installed:data.device.installed===true},camera,
  printer:{queue:text(data.printer?.queue),profile:['deli','g80'].includes(data.printer?.profile)?data.printer.profile:'',connected:!!text(data.printer?.queue)}};
}
const missing=error=>['42P01','42883','PGRST202','PGRST205'].includes(error?.code);
async function report(db,id,visitId,data){
 const result=await db.rpc('light_report_usage',{p_installation_id:id,p_visit_id:visitId,p_data:normalize(data)});
 if(result.error)throw new Error(missing(result.error)?'light_usage_not_configured':'light_usage_unavailable');
 return result.data;
}
async function admin(db,offset,search){
 const result=await db.rpc('light_usage_admin',{p_offset:Math.max(0,Math.min(1000000,Number.parseInt(offset,10)||0)),p_search:text(search,80)});
 if(result.error){if(missing(result.error))return {available:false,status:'light_usage_not_configured'};throw new Error('light_usage_unavailable');}
 return result.data;
}
module.exports={normalize,report,admin};
