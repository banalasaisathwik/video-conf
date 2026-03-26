import mediasoupClient from "mediasoup-client";

let device: mediasoupClient.Device;

async function createDevice(
  routerRtpCapabilities: mediasoupClient.types.RtpCapabilities,
) {
  device = new mediasoupClient.Device();

  try {
    await device.load({
      routerRtpCapabilities,
    });

    console.log("device created");
  } catch (error) {
    console.error("failed to create device", error);
    throw error;
  }

  return device;
}

function getDevice() {
  return device;
}

export { createDevice, getDevice };
