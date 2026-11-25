export const bedroomFamilies = {
  beds: 'Yataklar', headboards: 'Yatak başlıkları', overhead: 'Yatak üstü dolaplar', side: 'Yatak yanı dolapları',
  wardrobes: 'Gardıroplar', vanities: 'Makyaj masaları', nightstands: 'Komodinler', dressers: 'Şifonyerler',
  poufs: 'Oturma pufları', benches: 'Yatak ucu bankları', mirrors: 'Aynalar', shelves: 'Duvar rafları',
  art: 'Duvar dekorları', rugs: 'Halılar',
} as const
export type BedroomFamily = keyof typeof bedroomFamilies
type Kind = 'wall-cabinet' | 'box' | 'table' | 'sofa' | 'bed' | 'mirror' | 'wardrobe' | 'rug'
function entry<K extends Kind>(family: BedroomFamily, kind: K, name: string, size: [number, number, number], color: string, bottom?: number) {
  return { family, kind, name, size, color, bottom }
}

// Dimensions are width, depth and total height in millimetres. For a vanity
// with an attached mirror, the height includes the mirror.
export const bedroomCatalog = {
  'platform-bed': entry('beds', 'bed', 'Alçak platform yatak', [1740, 2160, 780], '#aa805d'),
  'wing-bed': entry('beds', 'bed', 'Kanat başlıklı yatak', [1760, 2180, 1160], '#a38878'),
  'spindle-bed': entry('beds', 'bed', 'Çubuk başlıklı karyola', [1650, 2120, 1000], '#956844'),
  'upholstered-headboard': entry('headboards', 'wall-cabinet', 'Kumaş yatak başlığı', [1640, 44, 690], '#b99e86', 430),
  'wood-headboard': entry('headboards', 'wall-cabinet', 'Ahşap yatak başlığı', [1640, 36, 630], '#aa805d', 460),
  'slatted-panel': entry('headboards', 'wall-cabinet', 'Çıtalı duvar paneli', [1640, 40, 1240], '#9b7350', 0),
  'quilted-headboard': entry('headboards', 'wall-cabinet', 'Kare panelli yatak başlığı', [1760, 80, 740], '#829086', 420),
  'upper-cabinet': entry('overhead', 'wall-cabinet', 'Yatak üstü dolap', [720, 330, 450], '#e2d7c5', 1900),
  'glass-upper': entry('overhead', 'wall-cabinet', 'Camlı yatak üstü dolap', [800, 320, 460], '#997d62', 1850),
  'triple-upper': entry('overhead', 'wall-cabinet', 'Üç bölmeli yatak üstü dolap', [1050, 350, 400], '#acb1a3', 1900),
  'side-cabinet': entry('side', 'wall-cabinet', 'Yatak yanı dolap modülü', [460, 340, 620], '#ad8665', 1710),
  'side-vitrine': entry('side', 'wall-cabinet', 'İnce camlı yan vitrin', [360, 300, 950], '#86715c', 1320),
  'side-double': entry('side', 'wall-cabinet', 'Çift kapaklı yan dolap', [660, 320, 570], '#9ca99b', 1650),
  'glass-wardrobe': entry('wardrobes', 'wardrobe', 'Bronz çerçeveli cam gardırop', [1500, 600, 2200], '#886c54'),
  'sliding-wardrobe': entry('wardrobes', 'wardrobe', 'Geniş sürgülü gardırop', [1800, 650, 2200], '#aa9479'),
  'niche-wardrobe': entry('wardrobes', 'wardrobe', 'Açık nişli yatak odası gardırobu', [900, 520, 2200], '#a69885'),
  vanity: entry('vanities', 'table', 'Makyaj masası', [920, 440, 760], '#cca684'),
  'round-vanity': entry('vanities', 'table', 'Yuvarlak aynalı makyaj masası', [1100, 470, 1460], '#ba987a'),
  'triptych-vanity': entry('vanities', 'table', 'Üç aynalı makyaj masası', [1220, 490, 1470], '#876853'),
  'bridge-vanity': entry('vanities', 'table', 'Çift kaideli makyaj masası', [1340, 490, 790], '#a59282'),
  'floating-nightstand': entry('nightstands', 'wall-cabinet', 'Askılı komodin', [420, 350, 240], '#a6805b', 390),
  'drawer-nightstand': entry('nightstands', 'box', 'Çekmeceli komodin', [460, 390, 510], '#9b7757'),
  'niche-nightstand': entry('nightstands', 'table', 'Açık raflı komodin', [480, 400, 510], '#b09174'),
  'pedestal-nightstand': entry('nightstands', 'table', 'Mantar ayaklı komodin', [430, 430, 480], '#907452'),
  dresser: entry('dressers', 'box', 'Şifonyer', [1080, 460, 820], '#9f8065'),
  'double-dresser': entry('dressers', 'box', 'Altı çekmeceli alçak şifonyer', [1420, 480, 760], '#9b795e'),
  'tower-dresser': entry('dressers', 'box', 'Beş çekmeceli dikey şifonyer', [600, 440, 1120], '#b6ab96'),
  'shelf-dresser': entry('dressers', 'box', 'Yan raflı şifonyer', [1160, 450, 850], '#a28669'),
  'drum-pouf': entry('poufs', 'sofa', 'Biyeli yuvarlak puf', [460, 460, 410], '#a96650'),
  'tufted-pouf': entry('poufs', 'sofa', 'Kare minderli puf', [520, 520, 400], '#889882'),
  'pedestal-pouf': entry('poufs', 'sofa', 'Ahşap kaideli oval puf', [620, 430, 440], '#bb9d83'),
  'pleated-pouf': entry('poufs', 'sofa', 'Dilimli kadife puf', [520, 520, 420], '#826a78'),
  'bed-bench': entry('benches', 'box', 'Yatak ucu bankı', [1180, 430, 440], '#ab9582'),
  'slat-bench': entry('benches', 'table', 'Alt raflı çıtalı bank', [1240, 400, 430], '#a17a54'),
  'bolster-bench': entry('benches', 'sofa', 'Silindir yastıklı bank', [1320, 460, 540], '#a29175'),
  'disc-mirror': entry('mirrors', 'mirror', 'Yuvarlak pirinç çerçeveli ayna', [700, 42, 700], '#a68b59', 1060),
  'oval-mirror': entry('mirrors', 'mirror', 'Oval boy aynası', [520, 52, 1460], '#88694d', 290),
  'panel-mirror': entry('mirrors', 'mirror', 'Üç panelli duvar aynası', [880, 44, 820], '#65594d', 940),
  'wall-shelf': entry('shelves', 'wall-cabinet', 'Duvar rafı', [800, 230, 48], '#af835e', 1430),
  'box-shelf': entry('shelves', 'wall-cabinet', 'Çerçeve duvar rafı', [800, 220, 320], '#a88360', 1370),
  'offset-shelf': entry('shelves', 'wall-cabinet', 'Basamaklı duvar rafı', [940, 210, 430], '#a7ab98', 1300),
  'wall-art': entry('art', 'wall-cabinet', 'Çerçeveli tablo', [580, 30, 720], '#9b744c', 1190),
  'triptych-art': entry('art', 'wall-cabinet', 'Üçlü soyut pano', [1040, 40, 640], '#94735d', 1210),
  'relief-art': entry('art', 'wall-cabinet', 'Kabartma duvar panosu', [660, 48, 720], '#b3957d', 1160),
  'striped-rug': entry('rugs', 'rug', 'Çizgili yatak yanı kilimi', [800, 1800, 12], '#aa8166'),
  'round-rug': entry('rugs', 'rug', 'Halkalı yuvarlak halı', [1500, 1500, 14], '#b5a48d'),
  'border-rug': entry('rugs', 'rug', 'Çift bordürlü halı', [1700, 2300, 16], '#9ca299'),
}
export type BedroomModel = keyof typeof bedroomCatalog
export const bedroomModels = Object.keys(bedroomCatalog) as BedroomModel[]
export const bedroomModelKinds = Object.fromEntries(bedroomModels.map(id => [id, bedroomCatalog[id].kind])) as {
  [M in BedroomModel]: typeof bedroomCatalog[M]['kind']
}
