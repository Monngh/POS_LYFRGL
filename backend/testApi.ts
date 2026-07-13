fetch("http://localhost:4000/api/public/sales/invoice/4695311b-39e1-43a1-b972-8a24f2ab6263/pdf")
  .then(async r => {
    console.log(r.status, r.statusText);
    console.log((await r.text()).substring(0, 500));
  });
