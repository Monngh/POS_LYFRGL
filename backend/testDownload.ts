import dotenv from 'dotenv';
dotenv.config();
fetch("https://www.facturapi.io/v2/invoices/6a4c13833c49adca988dce06/pdf", { 
  headers: { "Authorization": "Bearer " + process.env.FACTURAPI_API_KEY!.replace(/["']/g, "").trim() } 
}).then(async r => { 
  console.log(r.status, r.statusText); 
  console.log((await r.text()).substring(0, 500)); 
});
