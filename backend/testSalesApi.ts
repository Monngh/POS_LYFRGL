fetch("http://localhost:4000/api/admin/sales?status=COMPLETADA")
  .then(r => r.json())
  .then(data => {
    const sale = data.sales.find((s: any) => s.invoiceNumber === "V-595273763");
    console.log("SALE IN API:", sale);
  });
