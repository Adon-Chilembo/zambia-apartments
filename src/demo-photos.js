// Free photos from Unsplash (https://unsplash.com, Unsplash licence) used for the DEMO apartments only.
// The files are in public/demo-photos/ (1200px JPGs). Real landlords upload their own photos.
const demoPhotoFile = (id) => `demo/${id}.jpg`;

const DEMO_PHOTOS = {
  houses: [
    'photo-1787672358119-25cb4c768d14', // brick house, grey metal roof, sliding doors
    'photo-1786550860403-4a58f184643e', // single-storey house, palm trees
    'photo-1748063578185-3d68121b11ff', // modern house, lights at dusk
    'photo-1706164971302-e30c0640cc3b', // modern house with pool
    'photo-1706164971309-fb4785fe6ceb', // modern house, walkway to door
    'photo-1657346088167-b982455bf29a', // three-storey house at dusk
    'photo-1646083329688-4b004d8be9da', // house with walkway
    'photo-1759355787118-18d16b4ea30d', // brick house with garden
  ],
  blocks: [
    'photo-1624204386084-dd8c05e32226', // apartments with glass balconies
    'photo-1775733924031-521cd86c69cc', // apartments with balconies and greenery
    'photo-1592276040264-e10344a6a10e', // tree in front of beige block
    'photo-1542309175-9b88d743f89f', // beige block near trees
    'photo-1605267143746-999bf61d0d08', // beige block, blue sky
    'photo-1763657236522-700e47596a5c', // apartment block, sunset light
    'photo-1759687391118-9b10952df945', // brick block with balconies
    'photo-1769251846390-772c3a74b0da', // apartment buildings at sunset
    'photo-1638973140785-3b918e290682', // red brick building with balconies
    'photo-1590058582642-b130d1620a49', // white and brown block
  ],
  living: [
    'photo-1583847268964-b28dc8f51f92',
    'photo-1759691555285-74005fcf3ddf',
    'photo-1758448511322-8bfc73daf606',
    'photo-1612419299101-6c294dc2901d',
    'photo-1629042306558-7d1e15cc02fa',
    'photo-1600493505873-cddd69453072',
    'photo-1780427670049-43aa7921e3f0',
    'photo-1665249934445-1de680641f50',
  ],
  bedroom: [
    'photo-1616594039964-ae9021a400a0',
    'photo-1615874959474-d609969a20ed',
    'photo-1778731525620-ae459167c176',
    'photo-1616486029423-aaa4789e8c9a',
    'photo-1560185893-a55cbc8c57e8',
    'photo-1595526114035-0d45ed16cfbf',
    'photo-1566665797739-1674de7a421a',
    'photo-1758060215425-303300b1c7e2',
    'photo-1618221118493-9cfa1a1c00da',
    'photo-1562438668-bcf0ca6578f0',
  ],
  kitchen: [
    'photo-1600489000022-c2086d79f9d4',
    'photo-1484154218962-a197022b5858',
    'photo-1622372738946-62e02505feb3',
    'photo-1602028915047-37269d1a73f7',
    'photo-1628797285815-453c1d0d21e3',
    'photo-1507089947368-19c1da9775ae',
    'photo-1588854337236-6889d631faa8',
    'photo-1600684388091-627109f3cd60',
    'photo-1502005097973-6a7082348e28',
    'photo-1722605090433-41d1183a792d',
  ],
  bathroom: [
    'photo-1584622650111-993a426fbf0a',
    'photo-1631889993959-41b4e9c6e3c5',
    'photo-1763485956310-55f3c0e822d5',
    'photo-1620626011761-996317b8d101',
    'photo-1733426107854-ee00a25d72a7',
    'photo-1507652313519-d4e9174996dd',
    'photo-1643949719317-4342d8d4031e',
    'photo-1603825491103-bd638b1873b0',
  ],
  outdoor: [
    'photo-1633330948542-0b3bdeefcdb3', // patio with table and chairs
    'photo-1720442617080-c25f9955194c', // table and chairs outside
  ],
};

module.exports = { DEMO_PHOTOS, demoPhotoFile };
