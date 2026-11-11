// Isolated SQL adapter used only by local Light integration checks.
class Query {
  constructor(pg, table) { if (!/^light_[a-z_]+$/.test(table)) throw Error('Non-Light table access'); this.pg=pg; this.table=table; this.filters=[];this.values=[]; }
  select(columns='*') { this.columns=columns;return this; }
  eq(key,value) { if(!/^[a-z_]+$/.test(key))throw Error('Invalid filter');this.values.push(value);this.filters.push(`"${key}"=$${this.values.length}`);return this; }
  order(key,{ascending=true}={}) { if(!/^[a-z_]+$/.test(key))throw Error('Invalid ordering');this.sort=`order by "${key}" ${ascending?'asc':'desc'}`;return this; }
  limit(n) { this.count=Number(n);return this; }
  update(data) { this.updates=data;return this; }
  maybeSingle() {this.one=true;return this.run();}
  single() {this.one=true;this.required=true;return this.run();}
  then(resolve,reject){return this.run().then(resolve,reject);}
  async run(){try{
    let query,values=[...this.values];const where=this.filters.join(' and ')||'true';
    if(this.updates){const assignments=Object.entries(this.updates).map(([k,v])=>{if(!/^[a-z_]+$/.test(k))throw Error('Invalid update');values.push(v);return `"${k}"=$${values.length}`;});query=`update "${this.table}" set ${assignments.join(',')} where ${where} returning *`;}
    else if(this.columns==='license_id,light_licenses(*)')query=`select a.license_id,to_jsonb(l) as light_licenses from light_activations a join light_licenses l on l.id=a.license_id where ${where}`;
    else query=`select * from "${this.table}" where ${where} ${this.sort||''} ${this.count?'limit '+this.count:''}`;
    const rows=(await this.pg.query(query,values)).rows;if(this.required&&!rows.length)throw Error('Not found');return {data:this.one?rows[0]||null:rows,error:null};
  }catch(error){return {data:null,error};}}
}
module.exports=function database(pg){return {from(table){return new Query(pg,table);},async rpc(name,args){
  if(!/^light_[a-z_]+$/.test(name))throw Error('Non-Light RPC access');
  try{const names=Object.keys(args);const result=await pg.query(`select ${name}(${names.map((n,i)=>`${n} => $${i+1}`).join(',')}) as value`,Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));return {data:result.rows[0].value,error:null};}catch(error){return {data:null,error};}
}};};
