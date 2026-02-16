// Model Registry Configuration
// Based on docs/assets/models/*.md registry files

export interface ModelInfo {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  directory: string;
  pmxFile: string;
  thumbnail?: string;
  tags: string[];
  isAvailable: boolean;
  author?: string;
  priority: number;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'model.Phainon',
    name: '白厄',
    nameEn: 'Phainon',
    description: '基础白厄形象，阳光邻家大男孩',
    directory: 'assets/models/Phainon',
    pmxFile: '星穹铁道—白厄3.pmx',
    thumbnail: 'assets/model_photos/007.png',
    tags: ['基础', '默认'],
    isAvailable: true,
    author: '流云景',
    priority: 1,
  },
  {
    id: 'model.Phainon_Khaslana_normal',
    name: '卡厄斯兰那（完整版）',
    nameEn: 'Khaslana (Complete)',
    description: '完整卡厄斯兰那形态（法线贴图版）',
    directory: 'assets/models/Phainon_Khaslana_normal',
    pmxFile: '星穹铁道—白厄3.pmx',
    thumbnail: 'assets/model_photos/006.png',
    tags: ['变身', '完整'],
    isAvailable: true,
    author: '流云景',
    priority: 2,
  },
  {
    id: 'model.Phainon_Khaslana',
    name: '卡厄斯兰那（总裁版）',
    nameEn: 'Khaslana',
    description: '总裁风格卡厄斯兰那形态，外套效果评价很高，需标注 Credits',
    directory: 'assets/models/Phainon_Khaslana',
    pmxFile: '卡厄斯兰那_1109.Pmx',
    thumbnail: 'assets/model_photos/002.jpg',
    tags: ['变身', '外套'],
    isAvailable: true,
    author: 'FixEll',
    priority: 3,
  },
  {
    id: 'model.Phainon_Demiurge',
    name: '德谬歌-白厄',
    nameEn: 'Demiurge Phainon',
    description: '粉色风格变体，可爱系',
    directory: 'assets/models/Phainon_Demiurge/白厄 - 粉3',
    pmxFile: '德谬歌-白厄.pmx',
    thumbnail: 'assets/model_photos/004.jpg',
    tags: ['变体', '粉色'],
    isAvailable: true,
    author: '苏酥鱼鱼喵',
    priority: 4,
  },
  {
    id: 'model.Phainon_IronTomb_White',
    name: '铁墓白',
    nameEn: 'Iron Tomb White',
    description: '红色风格变体，英气十足',
    directory: 'assets/models/Phainon_IronTomb_White/白厄 - red',
    pmxFile: '铁墓白.pmx',
    thumbnail: 'assets/model_photos/001.jpg',
    tags: ['变体', '红色'],
    isAvailable: true,
    author: '苏酥鱼鱼喵',
    priority: 5,
  },
  {
    id: 'model.Phainon_Agent_White',
    name: '特工白厄',
    nameEn: 'Agent White',
    description: '警服造型，帅气利落',
    directory: 'assets/models/Phainon_Agent_White',
    pmxFile: '警服白厄2.pmx',
    thumbnail: 'assets/model_photos/003.jpg',
    tags: ['制服', '警服'],
    isAvailable: true,
    author: '随着2时间的推移',
    priority: 6,
  },
  {
    id: 'model.Phainon_Agent_Black',
    name: '秘密特工黑厄',
    nameEn: 'Agent Black',
    description: '黑色特工造型，神秘冷峻',
    directory: 'assets/models/Phainon_Agent_Black',
    pmxFile: '黑厄2.pmx',
    thumbnail: 'assets/model_photos/003.jpg',
    tags: ['制服', '特工', '黑色'],
    isAvailable: true,
    author: '随着2时间的推移',
    priority: 7,
  },
  {
    id: 'model.Phainon_CaptainUniform',
    name: '机长制服',
    nameEn: 'Captain Uniform',
    description: '机长制服造型，成熟稳重',
    directory: 'assets/models/Phainon_CaptainUniform',
    pmxFile: '机长制服.pmx',
    thumbnail: 'assets/model_photos/008.png',
    tags: ['制服', '机长'],
    isAvailable: true,
    author: '林槿',
    priority: 8,
  },
  {
    id: 'model.Phainon_LuckinCollab',
    name: '瑞幸联动',
    nameEn: 'Luckin Collab',
    description: '瑞幸咖啡联动特别造型',
    directory: 'assets/models/Phainon_LuckinCollab/白厄瑞幸联动',
    pmxFile: '瑞幸联动3.0.pmx',
    thumbnail: 'assets/model_photos/005.jpg',
    tags: ['联动', '休闲'],
    isAvailable: true,
    author: '林槿',
    priority: 9,
  },
  {
    id: 'model.Phainon_ANAN_Magazine',
    name: 'ANAN杂志',
    nameEn: 'ANAN Magazine',
    description: '时尚杂志造型',
    directory: 'assets/models/Phainon_ANAN_Magazine/白厄anan杂志',
    pmxFile: '白厄anan杂志.pmx',
    thumbnail: 'assets/model_photos/009.png',
    tags: ['时尚', '杂志'],
    isAvailable: true,
    author: '林槿',
    priority: 10,
  },
  {
    id: 'model.Phainon_Goddess_NoWings_NoHalo',
    name: '白厄女神(无翼)',
    nameEn: 'Goddess (No Wings)',
    description: '娘化变体，无翅膀无光环，婚纱级别',
    directory: 'assets/models/Phainon_Goddess/白厄女神 - by_填字小檀桌',
    pmxFile: '白厄女神(无翼无光环).pmx',
    thumbnail: 'assets/model_photos/013.png',
    tags: ['娘化', '女神'],
    isAvailable: true,
    author: '填字小檀桌',
    priority: 11,
  },
  {
    id: 'model.Phainon_Goddess_Wings_Halo',
    name: '白厄女神(带翼)',
    nameEn: 'Goddess (With Wings)',
    description: '娘化变体，带翅膀光环，婚纱级别',
    directory: 'assets/models/Phainon_Goddess/白厄女神 - by_填字小檀桌',
    pmxFile: '白厄女神（带翅膀光环）102.pmx',
    thumbnail: 'assets/model_photos/012.png',
    tags: ['娘化', '女神', '翅膀'],
    isAvailable: true,
    author: '填字小檀桌',
    priority: 12,
  },
  {
    id: 'model.Phainon_Lady_Skirt_LongHair',
    name: '白厄女士(短裙)',
    nameEn: 'Lady (Skirt)',
    description: '女士造型，短裙长发',
    directory: 'assets/models/Phainon_Lady/白厄女士 - 双版本',
    pmxFile: '白厄短裙长发.pmx',
    thumbnail: 'assets/model_photos/011.png',
    tags: ['女士', '短裙'],
    isAvailable: true,
    author: '填字小檀桌',
    priority: 13,
  },
  {
    id: 'model.Phainon_Lady_Coat_LongHair',
    name: '白厄女士(风衣)',
    nameEn: 'Lady (Coat)',
    description: '女士造型，风衣长发',
    directory: 'assets/models/Phainon_Lady/白厄女士 - 双版本',
    pmxFile: '白厄风衣长发.pmx',
    thumbnail: 'assets/model_photos/010.png',
    tags: ['女士', '风衣'],
    isAvailable: true,
    author: '填字小檀桌',
    priority: 14,
  },
];

export const getModelById = (id: string): ModelInfo | undefined => {
  return AVAILABLE_MODELS.find((model) => model.id === id);
};

export const getDefaultModel = (): ModelInfo => {
  return AVAILABLE_MODELS[0];
};

export const getAvailableModels = (): ModelInfo[] => {
  return AVAILABLE_MODELS.filter((model) => model.isAvailable).sort(
    (a, b) => a.priority - b.priority
  );
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function joinPath(directory: string, file: string): string {
  const normalizedDir = normalizePath(directory).replace(/\/+$/, '');
  const normalizedFile = normalizePath(file);
  return `${normalizedDir}/${normalizedFile}`;
}

function resolveLocalFilePath(filePath: string): string {
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath.startsWith('assets/') || normalizedPath.startsWith('configs/')) {
    return encodeURI(`/api/local-files/${normalizedPath}`);
  }
  return encodeURI(`/api/local-files/assets/${normalizedPath}`);
}

export const resolveModelPmxPath = (model: ModelInfo): string => {
  const fullPath = joinPath(model.directory, model.pmxFile);
  return resolveLocalFilePath(fullPath);
};

export const resolveModelPmxPathById = (modelId: string): string => {
  const model = getModelById(modelId) ?? getDefaultModel();
  return resolveModelPmxPath(model);
};

export const resolveModelThumbnailPath = (model: ModelInfo): string | null => {
  if (!model.thumbnail) {
    return null;
  }
  return resolveLocalFilePath(model.thumbnail);
};
