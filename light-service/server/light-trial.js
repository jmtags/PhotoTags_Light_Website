async function read(db,id){
 const result=await db.from('light_trials').select('*').eq('installation_id',id).maybeSingle();
 if(result.error){if(['42P01','PGRST205'].includes(result.error.code))return null;throw new Error('light_database_unavailable');}
 return result.data;
}
async function start(db,id){
 const result=await db.rpc('light_start_trial',{p_installation_id:id});
 if(result.error)throw new Error(['42P01','42883','PGRST202','PGRST205'].includes(result.error.code)?'light_trial_not_configured':/^light_[a-z_]+$/.test(result.error.message||'')?result.error.message:'light_database_unavailable');
 return result.data;
}
function active(trial){return !!trial&&Date.parse(trial.expires_at)>Date.now();}
function license(trial){return {id:'trial_'+trial.installation_id,plan_id:'trial',expires_at:trial.expires_at};}
module.exports={read,start,active,license};
