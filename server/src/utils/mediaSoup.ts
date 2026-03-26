import mediasoup from 'mediasoup'

let worker : mediasoup.types.Worker

async function startWorker(){
    worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });
  console.log("Mediasoup Worker started");
}

export {startWorker,worker}