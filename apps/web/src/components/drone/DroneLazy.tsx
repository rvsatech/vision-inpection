'use client';

import dynamic from 'next/dynamic';

// O bundle do Three.js só é baixado no navegador, depois do restante da página.
const DroneLazy = dynamic(() => import('./DroneSection'), {
  ssr: false,
  loading: () => <div style={{ height: '100svh', background: '#c9d3d8' }} />,
});

export default DroneLazy;
