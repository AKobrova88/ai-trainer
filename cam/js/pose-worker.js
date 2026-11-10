'use strict';

const assets = new URL('../../vendor/mediapipe/', self.location.href);
const locateFile = name => new URL(name, assets).href;
self.createMediapipeSolutionsPackedAssets = { locateFile };
let pose, result;
let queue = Promise.resolve();

self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    if (data.type === 'initialize') {
      importScripts(locateFile('pose.js') + '?v=2.7.3');
      pose = new self.Pose({ locateFile });
      pose.setOptions({ modelComplexity: data.kind === 'mp-full' ? 1 : 0, useCpuInference: true, smoothLandmarks: true, enableSegmentation: false });
      pose.onResults(frame => {
        result = { poseLandmarks: frame.poseLandmarks, poseWorldLandmarks: frame.poseWorldLandmarks };
        frame.image?.close?.();
      });
      await pose.initialize();
      self.postMessage({});
    } else if (data.type === 'frame') {
      result = null;
      try {
        await pose.send({ image: data.bitmap }, data.timestamp);
        self.postMessage({ result });
      } finally { data.bitmap.close(); }
    } else if (data.type === 'reset') {
      pose.reset();
    }
  }).catch(error => {
    if (data.type !== 'reset') self.postMessage({ error: error.message || String(error) });
  });
};
