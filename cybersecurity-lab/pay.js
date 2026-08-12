const response = await fetch("https://pay.kilimall.com/cashier/v2/open/getChannelList", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  body: JSON.stringify({
    merchantId: "LP1652932882829",
    countryCode: "KE",
    currency: "KES",
    orderAmount: "27128",
    page: 1,
    channels: "",
    platformUserId: ""
  })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
