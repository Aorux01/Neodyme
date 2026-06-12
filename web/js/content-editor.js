const LOCALES = ['en','ar','de','es','es-419','fr','it','ja','ko','pl','pt-BR','ru','tr'];
const LOCALE_LABELS = {
    en:'EN', ar:'AR', de:'DE', es:'ES', 'es-419':'ES-419', fr:'FR', it:'IT',
    ja:'JA', ko:'KO', pl:'PL', 'pt-BR':'PT-BR', ru:'RU', tr:'TR'
};

let CE_state = {
    scope: null,
    section: null,
    raw: null,         // original content from server (object or null)
    locale: 'en',      // currently displayed locale across i18n widgets
    dirty: false,
};

// ---------- Schemas ----------------------------------------------------------
//
// Every schema is { title, description, fields: [...] }.
// Field types:
//   - string     { key, label, multiline?, placeholder? }
//   - number     { key, label }
//   - bool       { key, label }
//   - url        { key, label }
//   - i18n       { key, label, multiline? }          (string OR {locale: string})
//   - image      { key, label, width?, height? }     (Epic image[] = single-item array of {width,height,url})
//   - list       { key, label, itemSchema, summary?(it)=>string }   (array of objects rendered as collapsible cards)
//   - select     { key, label, options:[...] }

const SCHEMA_LOGIN_MESSAGE = {
    title: 'Login Message',
    description: 'Shown to every player right after they connect. Single message with i18n title and body.',
    pathInfo: 'content/pages/content-pages.json -> loginmessage',
    fields: [
        { key: 'loginmessage.message.title', label: 'Title', type: 'i18n' },
        { key: 'loginmessage.message.body', label: 'Body', type: 'i18n', multiline: true },
        { key: '_activeDate', label: 'Active date (ISO)', type: 'string', placeholder: '2017-10-17T01:23:45.050Z' },
    ],
    defaults: () => ({
        _title: 'LoginMessage',
        loginmessage: {
            _type: 'CommonUI Simple Message',
            message: { _type: 'CommonUI Simple Message Base', title: 'Neodyme', body: { en: '' } }
        },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

// Shared schema for emergencynotice (v1) - list of CommonUI Simple Message Base.
const SCHEMA_EMERGENCY_NOTICE = {
    title: 'Emergency Notice',
    description: 'Big lobby notices. Each entry can be hidden, spotlighted, and translated.',
    pathInfo: 'content/pages/content-pages.json -> emergencynotice',
    listKey: 'news.messages',
    itemSummary: (it) => firstLocale(it && it.title) || '(untitled)',
    itemSchema: [
        { key: 'title', label: 'Title', type: 'i18n' },
        { key: 'body', label: 'Body', type: 'i18n', multiline: true },
        { key: 'image', label: 'Image URL', type: 'image-url' },
        { key: 'adspace', label: 'Adspace tag', type: 'string' },
        { key: 'spotlight', label: 'Spotlight', type: 'bool' },
        { key: 'hidden', label: 'Hidden', type: 'bool' },
    ],
    newItem: () => ({
        _type: 'CommonUI Simple Message Base',
        title: { en: 'New emergency notice' },
        body:  { en: 'Notice body - translate or replace before publishing.' },
        hidden: false,
        spotlight: false
    }),
    wrap: (items) => ({
        news: { _type: 'Battle Royale News', messages: items },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_EMERGENCY_NOTICE_V2 = {
    title: 'Emergency Notice v2',
    description: 'Modern emergency notice format used by recent client builds. Lives under emergencynotices.emergencynotices[].',
    pathInfo: 'content/pages/content-pages.json -> emergencynoticev2',
    listKey: 'emergencynotices.emergencynotices',
    itemSummary: (it) => firstLocale(it && it.title) || '(untitled)',
    itemSchema: [
        { key: 'title', label: 'Title', type: 'i18n' },
        { key: 'body', label: 'Body', type: 'i18n', multiline: true },
        { key: 'hidden', label: 'Hidden', type: 'bool' },
    ],
    newItem: () => ({
        _type: 'CommonUI Emergency Notice Base',
        gamemodes: [],
        title: 'Neodyme',
        body: { en: 'New emergency notice - translate or replace before publishing.' },
        hidden: false
    }),
    wrap: (items) => ({
        _title: 'emergencynoticev2',
        _noIndex: false,
        emergencynotices: { _type: 'Emergency Notices', emergencynotices: items },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

// BR News legacy (battleroyalenews) - mix of motds[] (rich) and messages[] (simple).
const MOTD_ITEM_SCHEMA = [
    { key: 'title', label: 'Title', type: 'i18n' },
    { key: 'body', label: 'Body', type: 'i18n', multiline: true },
    { key: 'image', label: 'Image URL (banner 1920x1080)', type: 'image-url' },
    { key: 'tileImage', label: 'Tile image URL (1024x512)', type: 'image-url' },
    { key: 'tabTitleOverride', label: 'Tab title override', type: 'string' },
    { key: 'entryType', label: 'Entry type', type: 'select', options: ['Texte','Website','Video'] },
    { key: 'websiteButtonText', label: 'Website button text', type: 'string' },
    { key: 'websiteURL', label: 'Website URL', type: 'url' },
    { key: 'spotlight', label: 'Spotlight', type: 'bool' },
    { key: 'hidden', label: 'Hidden', type: 'bool' },
    { key: 'videoMute', label: 'Video muted', type: 'bool' },
];

const SCHEMA_BR_NEWS = {
    title: 'BR News (legacy)',
    description: 'Used by chapter 1 clients. Contains a list of MOTDs (rich) and a list of simple messages.',
    pathInfo: 'content/pages/content-pages.json -> battleroyalenews',
    twoLists: true,
    listA: {
        key: 'news.motds',
        label: 'MOTDs (rich)',
        itemSummary: (it) => firstLocale(it && it.title) || '(untitled)',
        itemSchema: MOTD_ITEM_SCHEMA,
        newItem: () => ({
            entryType: 'Website',
            _type: 'CommonUI Simple Message MOTD',
            title: { en: 'New MOTD' },
            body:  { en: 'MOTD body - translate or replace before publishing.' },
            image: '', tileImage: '',
            videoMute: false, hidden: false, spotlight: false
        })
    },
    listB: {
        key: 'news.messages',
        label: 'Simple messages',
        itemSummary: (it) => firstLocale(it && it.title) || '(untitled)',
        itemSchema: [
            { key: 'title', label: 'Title', type: 'i18n' },
            { key: 'body', label: 'Body', type: 'i18n', multiline: true },
            { key: 'image', label: 'Image URL', type: 'image-url' },
            { key: 'adspace', label: 'Adspace tag', type: 'string' },
            { key: 'spotlight', label: 'Spotlight', type: 'bool' },
            { key: 'hidden', label: 'Hidden', type: 'bool' },
        ],
        newItem: () => ({ _type: 'CommonUI Simple Message Base', title: { en: 'New message' }, body: { en: 'Message body - translate or replace before publishing.' }, hidden: false })
    },
    wrap: (a, b) => ({
        news: { _type: 'Battle Royale News', motds: a, messages: b, platform_messages: [], _title: 'battleroyalenews' },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_BR_NEWS_V2 = {
    title: 'BR News v2 (legacy)',
    description: 'Used by chapter 2 early clients. Same MOTD format as BR News, served at battleroyalenewsv2.',
    pathInfo: 'content/pages/content-pages.json -> battleroyalenewsv2',
    listKey: 'news.motds',
    itemSummary: (it) => firstLocale(it && it.title) || '(untitled)',
    itemSchema: MOTD_ITEM_SCHEMA,
    newItem: () => ({
        entryType: 'Website',
        _type: 'CommonUI Simple Message MOTD',
        title: { en: 'New MOTD' },
        body:  { en: '' },
        image: '', tileImage: '',
        videoMute: false, hidden: false, spotlight: false
    }),
    wrap: (items) => ({
        news: { motds: items, _title: 'battleroyalenewsv2' },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_CREATIVE_NEWS = clone(SCHEMA_BR_NEWS, { title: 'Creative News', pathInfo: 'content/pages/content-pages.json -> creativenews' });
const SCHEMA_STW_NEWS      = clone(SCHEMA_BR_NEWS, { title: 'Save the World News', pathInfo: 'content/pages/content-pages.json -> savetheworldnews' });

const SCHEMA_ATHENA_MESSAGE = {
    title: 'Athena Message',
    description: 'Single overrideable message shown in the BR lobby.',
    pathInfo: 'content/pages/content-pages.json -> athenamessage',
    fields: [
        { key: 'overrideablemessage.message.image', label: 'Image URL', type: 'image-url' },
        { key: 'overrideablemessage.message.title', label: 'Title', type: 'i18n' },
        { key: 'overrideablemessage.message.body', label: 'Body', type: 'i18n', multiline: true },
    ],
    defaults: () => ({
        _title: 'athenamessage',
        overrideablemessage: {
            _type: 'CommonUI Simple Message',
            message: { _type: 'CommonUI Simple Message Base', title: { en: '' }, body: { en: '' }, image: '' }
        },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_SURVIVAL_MESSAGE = clone(SCHEMA_ATHENA_MESSAGE, { title: 'Survival Message', pathInfo: 'content/pages/content-pages.json -> survivalmessage' });
SCHEMA_SURVIVAL_MESSAGE.defaults = () => { const d = SCHEMA_ATHENA_MESSAGE.defaults(); d._title = 'survivalmessage'; return d; };

// MOTD modern (config/motd.json) - list of contentItems, very rich schema.
const SCHEMA_MOTD_MODERN = {
    title: 'MOTD (modern)',
    description: 'Modern news system used by chapter 2+ clients. Each item has 3 title variants and 3 body variants (compact / teaser / fullscreen) plus media.',
    pathInfo: 'config/motd.json',
    listKey: 'contentItems',
    itemSummary: (it) => {
        const cf = it && it.contentFields;
        return firstLocale(cf && cf.title) || it.contentId || '(untitled)';
    },
    itemSchema: [
        { key: 'contentId', label: 'Content ID (slug)', type: 'string', placeholder: 'neodyme-welcome' },
        { key: 'contentFields.title', label: 'Title (compact)', type: 'i18n' },
        { key: 'contentFields.TeaserTitle', label: 'Teaser title', type: 'i18n' },
        { key: 'contentFields.FullScreenTitle', label: 'Fullscreen title', type: 'i18n' },
        { key: 'contentFields.body', label: 'Body (compact)', type: 'i18n', multiline: true },
        { key: 'contentFields.FullScreenBody', label: 'Fullscreen body', type: 'i18n', multiline: true },
        { key: 'contentFields.tabTitleOverride', label: 'Tab title override', type: 'string' },
        { key: 'contentFields.entryType', label: 'Entry type', type: 'select', options: ['Website','Video','Texte'] },
        { key: 'contentFields.image.0.url', label: 'Banner image URL (1920x1080)', type: 'image-url' },
        { key: 'contentFields.tileImage.0.url', label: 'Tile image URL (1024x512)', type: 'image-url' },
        { key: 'contentFields.FullScreenBackground.Image.0.url', label: 'Fullscreen background URL (1920x1080)', type: 'image-url' },
        { key: 'contentFields.TeaserBackground.Image.0.url', label: 'Teaser background URL (1024x512)', type: 'image-url' },
        { key: 'contentFields.websiteButtonText', label: 'Website button text', type: 'string' },
        { key: 'contentFields.websiteURL', label: 'Website URL', type: 'url' },
        { key: 'contentFields.sortingPriority', label: 'Sorting priority (higher = first)', type: 'number' },
        { key: 'contentFields.spotlight', label: 'Spotlight', type: 'bool' },
        { key: 'contentFields.VerticalTextLayout', label: 'Vertical text layout', type: 'bool' },
        { key: 'contentFields.videoAutoplay', label: 'Video autoplay', type: 'bool' },
        { key: 'contentFields.videoLoop', label: 'Video loop', type: 'bool' },
        { key: 'contentFields.videoMute', label: 'Video muted', type: 'bool' },
        { key: 'contentFields.videoStreamingEnabled', label: 'Video streaming', type: 'bool' },
    ],
    newItem: () => ({
        contentType: 'content-item',
        contentId: 'new-motd-' + Math.random().toString(36).slice(2, 8),
        tcId: cryptoUuid(),
        contentFields: {
            title: { en: 'New MOTD' },
            TeaserTitle: { en: 'New MOTD' },
            FullScreenTitle: { en: 'New MOTD' },
            body: { en: 'MOTD body - translate or replace before publishing.' },
            FullScreenBody: { en: 'MOTD body - translate or replace before publishing.' },
            entryType: 'Website',
            image: [{ width: 1920, height: 1080, url: '' }],
            tileImage: [{ width: 1024, height: 512, url: '' }],
            FullScreenBackground: { _type: 'FullScreenBackground', Image: [{ width: 1920, height: 1080, url: '' }] },
            TeaserBackground:     { _type: 'TeaserBackground',     Image: [{ width: 1024, height: 512,  url: '' }] },
            sortingPriority: 50,
            spotlight: false,
            VerticalTextLayout: false,
            videoAutoplay: false, videoLoop: false, videoMute: false, videoStreamingEnabled: false,
            websiteButtonText: 'Read More',
            websiteURL: 'https://example.com/'
        },
        contentHash: 'neodyme-' + Math.random().toString(36).slice(2, 10),
        contentSchemaName: 'MotdWebsiteNewsWithVideo'
    }),
    wrap: (items) => ({
        contentType: 'collection',
        contentId: 'Neodyme-motd-v2',
        tcId: '634e8e85-e2fc-4c68-bb10-93604cf6605f',
        contentMeta: '{}',
        contentItems: items
    })
};

const SCHEMA_LOBBY = {
    title: 'Lobby',
    description: 'Default lobby background + stage. Per-season overrides still come from page-service.js (Lobby Background Manager will replace that later).',
    pathInfo: 'content/pages/content-pages.json -> lobby',
    fields: [
        { key: 'backgroundimage', label: 'Background image URL', type: 'image-url' },
        { key: 'stage', label: 'Stage', type: 'string', placeholder: 'default / seasonx / winter19 / ...' },
        { key: '_activeDate', label: 'Active date (ISO)', type: 'string' },
    ],
    defaults: () => ({
        _title: 'lobby', backgroundimage: '', stage: 'default',
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_SPECIAL_OFFER_VIDEO = {
    title: 'Special Offer Video',
    description: 'Promo video shown in the lobby. Toggle to enable, then point to a video UID/string.',
    pathInfo: 'content/pages/content-pages.json -> specialoffervideo',
    fields: [
        { key: 'bSpecialOfferEnabled', label: 'Special offer enabled', type: 'bool' },
        { key: 'specialoffervideo.bCheckAutoPlay', label: 'Auto-play check', type: 'bool' },
        { key: 'specialoffervideo.bStreamingEnabled', label: 'Streaming enabled', type: 'bool' },
        { key: 'specialoffervideo.videoString', label: 'Video string', type: 'string' },
        { key: 'specialoffervideo.videoUID', label: 'Video UID', type: 'string' },
    ],
    defaults: () => ({
        _title: 'specialoffervideo', _noIndex: false, _locale: 'pl',
        bSpecialOfferEnabled: false,
        specialoffervideo: { _type: 'SpecialOfferVideoConfig', bCheckAutoPlay: true, bStreamingEnabled: true, videoString: '', videoUID: '' },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    })
};

// Subgame Select / Info both have 3 parallel sub-objects (battleroyale,
// savetheworld, creative) - we flatten the schema with a section per mode.
const SUBGAME_MODES = [
    { key: 'battleroyale', label: 'Battle Royale' },
    { key: 'savetheworld', label: 'Save the World' },
    { key: 'saveTheWorldUnowned', label: 'Save the World (unowned)' },
    { key: 'creative', label: 'Creative' },
];

const SCHEMA_SUBGAME_SELECT = {
    title: 'Subgame Select',
    description: 'Title and body shown to each subgame in the BR/STW/Creative selector. One i18n title+body per mode.',
    pathInfo: 'content/pages/content-pages.json -> subgameselectdata',
    fields: SUBGAME_MODES.flatMap(m => [
        { key: `${m.key}.message.title`, label: `${m.label} - title`, type: 'i18n' },
        { key: `${m.key}.message.body`, label: `${m.label} - body`, type: 'i18n', multiline: true },
        { key: `${m.key}.message.image`, label: `${m.label} - image URL`, type: 'image-url' },
    ]),
    defaults: () => ({ _title: 'subgameselectdata' })
};

const SCHEMA_SUBGAME_INFO = {
    title: 'Subgame Info',
    description: 'Short title + description + color for each subgame card (BR / STW / Creative).',
    pathInfo: 'content/pages/content-pages.json -> subgameinfo',
    fields: ['battleroyale', 'savetheworld', 'creative'].flatMap(k => {
        const m = SUBGAME_MODES.find(x => x.key === k) || { label: k };
        return [
            { key: `${k}.title`, label: `${m.label} - title`, type: 'i18n' },
            { key: `${k}.description`, label: `${m.label} - description`, type: 'i18n', multiline: true },
            { key: `${k}.image`, label: `${m.label} - image URL`, type: 'image-url' },
            { key: `${k}.color`, label: `${m.label} - color (hex, no #)`, type: 'string', placeholder: '1164c1' },
        ];
    }),
    defaults: () => ({ _title: 'subgameinfo' })
};

const SCHEMA_BP_ABOUT = {
    title: 'Battle Pass About',
    description: 'Multi-card explainer ("How does it work?", "What\'s inside?", ...). Each card has a title, body and optional image.',
    pathInfo: 'content/pages/content-pages.json -> battlepassaboutmessages',
    listKey: 'news.messages',
    itemSummary: (it) => (typeof it.title === 'string' ? it.title : firstLocale(it && it.title)) || '(untitled)',
    itemSchema: [
        { key: 'title', label: 'Title', type: 'i18n' },
        { key: 'body', label: 'Body', type: 'i18n', multiline: true },
        { key: 'image', label: 'Image URL', type: 'image-url' },
        { key: 'layout', label: 'Layout', type: 'select', options: ['Right Image', 'Left Image'] },
        { key: 'spotlight', label: 'Spotlight', type: 'bool' },
        { key: 'hidden', label: 'Hidden', type: 'bool' },
    ],
    newItem: () => ({
        _type: 'CommonUI Simple Message Base',
        layout: 'Right Image',
        title: 'NEW CARD',
        body:  { en: 'Describe this battle-pass perk.' },
        image: '',
        hidden: false, spotlight: false
    }),
    wrap: (items) => ({
        news: { _type: 'Battle Royale News', messages: items, platform_messages: [] },
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_CREATIVE_ADS = {
    title: 'Creative Ads',
    description: 'In-game pop-up promotions in Creative mode. Each ad has an image and a target URL.',
    pathInfo: 'content/pages/content-pages.json -> creativeAds',
    listKey: 'ad_info.ads',
    itemSummary: (it) => firstLocale(it && it.title) || it && it.adId || '(untitled ad)',
    itemSchema: [
        { key: 'adId', label: 'Ad ID', type: 'string', placeholder: 'unique-ad-slug' },
        { key: 'title', label: 'Title', type: 'i18n' },
        { key: 'body', label: 'Body', type: 'i18n', multiline: true },
        { key: 'image', label: 'Image URL', type: 'image-url' },
        { key: 'targetURL', label: 'Target URL', type: 'url' },
        { key: 'hidden', label: 'Hidden', type: 'bool' },
    ],
    newItem: () => ({
        _type: 'Creative Ad',
        adId: 'ad-' + Math.random().toString(36).slice(2, 8),
        title: { en: 'New ad' }, body: { en: '' }, image: '', targetURL: '',
        hidden: false
    }),
    wrap: (items) => ({
        ad_info: { ads: items, _type: 'Creative Ad Info' },
        _title: 'creative-ads',
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMA_CREATIVE_FEATURES = {
    title: 'Creative Features',
    description: 'Featured creative islands/spotlight cards. Each entry highlights a creative feature.',
    pathInfo: 'content/pages/content-pages.json -> creativeFeatures',
    listKey: 'ad_info.features',
    itemSummary: (it) => firstLocale(it && it.title) || (it && it.featureId) || '(untitled feature)',
    itemSchema: [
        { key: 'featureId', label: 'Feature ID', type: 'string', placeholder: 'unique-feature-slug' },
        { key: 'title', label: 'Title', type: 'i18n' },
        { key: 'body', label: 'Body', type: 'i18n', multiline: true },
        { key: 'image', label: 'Image URL', type: 'image-url' },
        { key: 'islandCode', label: 'Island code', type: 'string', placeholder: '0000-0000-0000' },
        { key: 'hidden', label: 'Hidden', type: 'bool' },
    ],
    newItem: () => ({
        _type: 'Creative Feature',
        featureId: 'feature-' + Math.random().toString(36).slice(2, 8),
        title: { en: 'New feature' }, body: { en: '' }, image: '', islandCode: '',
        hidden: false
    }),
    wrap: (items) => ({
        ad_info: { features: items, _type: 'Creative Ad Info' },
        _title: 'Creative Features',
        _activeDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        lastModified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        _locale: 'en-US'
    })
};

const SCHEMAS = {
    'pages:loginmessage':       SCHEMA_LOGIN_MESSAGE,
    'pages:emergencynotice':    SCHEMA_EMERGENCY_NOTICE,
    'pages:emergencynoticev2':  SCHEMA_EMERGENCY_NOTICE_V2,
    'pages:battleroyalenews':   SCHEMA_BR_NEWS,
    'pages:battleroyalenewsv2': SCHEMA_BR_NEWS_V2,
    'pages:creativenews':       SCHEMA_CREATIVE_NEWS,
    'pages:savetheworldnews':   SCHEMA_STW_NEWS,
    'pages:athenamessage':      SCHEMA_ATHENA_MESSAGE,
    'pages:survivalmessage':    SCHEMA_SURVIVAL_MESSAGE,
    'motd:root':                SCHEMA_MOTD_MODERN,
    'pages:lobby':                  SCHEMA_LOBBY,
    'pages:specialoffervideo':      SCHEMA_SPECIAL_OFFER_VIDEO,
    'pages:subgameselectdata':      SCHEMA_SUBGAME_SELECT,
    'pages:subgameinfo':            SCHEMA_SUBGAME_INFO,
    'pages:battlepassaboutmessages':SCHEMA_BP_ABOUT,
    'pages:creativeAds':            SCHEMA_CREATIVE_ADS,
    'pages:creativeFeatures':       SCHEMA_CREATIVE_FEATURES,
};

function clone(obj, overrides) { return Object.assign({}, obj, overrides || {}); }

function cryptoUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function firstLocale(val) {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') return val.en || val.fr || Object.values(val)[0] || '';
    return '';
}

function getPath(obj, path) {
    if (!obj) return undefined;
    return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = isNaN(parts[i+1]) ? {} : [];
        cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
}

function localeCoverage(val) {
    if (typeof val === 'string') return { n: 1, total: 1, isString: true };
    if (!val || typeof val !== 'object') return { n: 0, total: LOCALES.length, isString: false };
    const n = LOCALES.filter(l => typeof val[l] === 'string' && val[l].trim().length > 0).length;
    return { n, total: LOCALES.length, isString: false };
}

// Single source of truth for the dirty flag. Updates the save button visual
// state so staff always know there are unsaved edits.
function setDirty(d) {
    CE_state.dirty = !!d;
    const btn = document.querySelector('.content-editor-actions .btn-primary');
    if (btn) btn.classList.toggle('has-unsaved', !!d);
}

function showContentMsg(type, text) {
    const el = document.getElementById('content-editor-status');
    if (!el) return;
    el.className = 'content-editor-status ' + (type === 'error' ? 'is-error' : 'is-ok');
    el.textContent = text;
    setTimeout(() => { if (el.textContent === text) { el.className = 'content-editor-status'; el.textContent = ''; } }, 3000);
}

function resetContentEditor() {
    const placeholder = document.getElementById('content-editor-placeholder');
    const body = document.getElementById('content-editor-body');
    if (placeholder) placeholder.style.display = '';
    if (body) { body.style.display = 'none'; body.innerHTML = ''; }
    document.querySelectorAll('.content-nav-item.active').forEach(el => el.classList.remove('active'));
    CE_state = { scope: null, section: null, raw: null, locale: 'en', dirty: false };
}

async function openContentEditor(scope, section) {
    const key = `${scope}:${section}`;
    const schema = SCHEMAS[key];
    if (!schema) { showContentMsg('error', 'Unknown section.'); return; }

    // Guard against silently dropping unsaved edits when staff clicks another
    // section in the sidebar. The dirty flag is cleared on save / reload.
    const switchingAway = CE_state.scope && (CE_state.scope !== scope || CE_state.section !== section);
    if (switchingAway && CE_state.dirty) {
        if (!confirm('You have unsaved changes. Discard them and switch?')) return;
    }

    document.querySelectorAll('.content-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.content-nav-item[data-scope="${scope}"][data-section="${section}"]`)?.classList.add('active');

    const placeholder = document.getElementById('content-editor-placeholder');
    const body = document.getElementById('content-editor-body');
    placeholder.style.display = 'none';
    body.style.display = '';
    body.innerHTML = `<div class="content-editor-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;

    try {
        const res = await fetch(`/neodyme/api/dev/content/${scope}/${section}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) {
            body.innerHTML = `<div class="content-editor-error">${apiError(data, 'Failed to load.')}</div>`;
            return;
        }
        let content = data.content;
        if (!content && schema.defaults) content = schema.defaults();
        if (!content) content = {};

        CE_state.scope = scope;
        CE_state.section = section;
        CE_state.raw = content;
        setDirty(false);

        renderEditor(schema, content);
    } catch (err) {
        body.innerHTML = `<div class="content-editor-error">${err.message}</div>`;
    }
}

function renderEditor(schema, content) {
    const body = document.getElementById('content-editor-body');
    body.innerHTML = `
        <header class="content-editor-header">
            <div>
                <h3>${escapeHtml(schema.title)}</h3>
                <p class="muted">${escapeHtml(schema.description || '')}</p>
                <p class="path-info"><i class="fas fa-file-code"></i> ${escapeHtml(schema.pathInfo || '')}</p>
            </div>
            <div class="content-editor-actions">
                <div id="content-editor-status" class="content-editor-status"></div>
                <button class="btn btn-danger" onclick="resetCurrentContent()" title="Re-download this file from the GitHub repo (discards local edits)"><i class="fas fa-cloud-download-alt"></i> Reset file</button>
                <button class="btn btn-secondary" onclick="reloadCurrentEditor()"><i class="fas fa-undo"></i> Reload</button>
                <button class="btn btn-primary" onclick="saveCurrentEditor()"><i class="fas fa-save"></i> Save</button>
            </div>
        </header>
        ${renderLocaleBar()}
        <div id="content-editor-form"></div>
    `;
    const form = document.getElementById('content-editor-form');

    if (schema.fields) {
        // Single-record schema (login, athena, survival, ...).
        form.innerHTML = schema.fields.map((f, idx) => renderField(f, getPath(content, f.key), `field-${idx}`)).join('');
        wireFieldsEvents(content, schema.fields, '');
    } else if (schema.twoLists) {
        const a = getPath(content, schema.listA.key) || [];
        const b = getPath(content, schema.listB.key) || [];
        form.innerHTML = `
            ${renderListBlock(schema.listA, a, 'A')}
            ${renderListBlock(schema.listB, b, 'B')}
        `;
        wireListEvents(schema.listA, a, 'A');
        wireListEvents(schema.listB, b, 'B');
    } else if (schema.listKey) {
        const items = getPath(content, schema.listKey) || [];
        form.innerHTML = renderListBlock({
            key: schema.listKey, label: 'Entries',
            itemSummary: schema.itemSummary, itemSchema: schema.itemSchema, newItem: schema.newItem
        }, items, 'A');
        wireListEvents({
            key: schema.listKey, itemSchema: schema.itemSchema, newItem: schema.newItem, itemSummary: schema.itemSummary
        }, items, 'A');
    }
}

function renderLocaleBar() {
    return `
        <div class="locale-bar">
            <span class="locale-bar-label"><i class="fas fa-language"></i> Editing locale:</span>
            ${LOCALES.map(l => `<button class="locale-btn ${l===CE_state.locale?'active':''}" data-locale="${l}" onclick="setEditorLocale('${l}')">${LOCALE_LABELS[l]}</button>`).join('')}
        </div>
    `;
}

function setEditorLocale(l) {
    if (!LOCALES.includes(l)) return;
    CE_state.locale = l;
    document.querySelectorAll('.locale-btn').forEach(b => b.classList.toggle('active', b.dataset.locale === l));
    document.querySelectorAll('.i18n-input').forEach(el => {
        const path = el.dataset.path;
        const ctx  = el.dataset.ctx || '';
        const root = resolveContext(ctx);
        const cur  = getPath(root, path);
        if (typeof cur === 'string') {
            el.value = cur;
            const toggle = el.parentElement.querySelector('.i18n-toggle input');
            if (toggle) toggle.checked = false;
        } else if (cur && typeof cur === 'object') {
            el.value = cur[l] || '';
            const toggle = el.parentElement.querySelector('.i18n-toggle input');
            if (toggle) toggle.checked = true;
        } else {
            el.value = '';
        }
        updateCoverageBadge(el);
    });
}

function resolveContext(ctx) {
    if (!ctx) return CE_state.raw;
    // ctx format: "listKey:index"
    const [listKey, idx] = ctx.split('#');
    const list = getPath(CE_state.raw, listKey) || [];
    return list[parseInt(idx, 10)];
}

function renderField(field, value, id, ctx) {
    const ctxAttr = ctx ? `data-ctx="${escapeAttr(ctx)}"` : '';
    switch (field.type) {
        case 'string':
        case 'url':
            return `
                <div class="field-row">
                    <label>${escapeHtml(field.label)}</label>
                    <input type="${field.type === 'url' ? 'url' : 'text'}" class="form-input simple-input"
                        ${ctxAttr} data-path="${escapeAttr(field.key)}"
                        value="${escapeAttr(value || '')}"
                        placeholder="${escapeAttr(field.placeholder || '')}">
                </div>`;
        case 'image-url':
            return `
                <div class="field-row field-row-image">
                    <label>${escapeHtml(field.label)}</label>
                    <div class="image-url-wrap">
                        <input type="url" class="form-input simple-input image-url-input"
                            ${ctxAttr} data-path="${escapeAttr(field.key)}"
                            value="${escapeAttr(value || '')}"
                            placeholder="${escapeAttr(field.placeholder || 'https://...')}">
                        <button type="button" class="btn btn-sm btn-secondary image-url-btn" data-act="upload" title="Upload from your computer"><i class="fas fa-upload"></i></button>
                        <button type="button" class="btn btn-sm btn-secondary image-url-btn" data-act="browse" title="Pick from library"><i class="fas fa-images"></i></button>
                        <div class="image-thumb">${value ? `<img src="${escapeAttr(value)}" alt="" onerror="this.parentElement.classList.add('broken');this.parentElement.title='Image not loading: '+this.src">` : '<span class="image-thumb-empty">no image</span>'}</div>
                    </div>
                </div>`;
        case 'number':
            return `
                <div class="field-row">
                    <label>${escapeHtml(field.label)}</label>
                    <input type="number" class="form-input simple-input"
                        ${ctxAttr} data-path="${escapeAttr(field.key)}"
                        value="${escapeAttr(value == null ? '' : value)}">
                </div>`;
        case 'bool':
            return `
                <div class="field-row field-row-bool">
                    <label>${escapeHtml(field.label)}</label>
                    <input type="checkbox" class="bool-input"
                        ${ctxAttr} data-path="${escapeAttr(field.key)}"
                        ${value ? 'checked' : ''}>
                </div>`;
        case 'select':
            return `
                <div class="field-row">
                    <label>${escapeHtml(field.label)}</label>
                    <select class="form-input select-input"
                        ${ctxAttr} data-path="${escapeAttr(field.key)}">
                        ${field.options.map(o => `<option value="${escapeAttr(o)}" ${o===value?'selected':''}>${escapeHtml(o)}</option>`).join('')}
                    </select>
                </div>`;
        case 'i18n':
            return renderI18nField(field, value, ctxAttr);
        default:
            return `<div class="field-row"><label>${escapeHtml(field.label)}</label><em>unsupported type: ${field.type}</em></div>`;
    }
}

function renderI18nField(field, value, ctxAttr) {
    const isString = typeof value === 'string';
    const current = isString ? value : (value && value[CE_state.locale]) || '';
    const cov = localeCoverage(value);
    const covLabel = cov.isString
        ? '<span class="coverage-badge is-string">plain string</span>'
        : `<span class="coverage-badge ${cov.n===cov.total?'is-full':(cov.n===0?'is-empty':'is-partial')}">${cov.n}/${cov.total} translations</span>`;
    const inputHtml = field.multiline
        ? `<textarea class="form-input i18n-input" rows="3" ${ctxAttr} data-path="${escapeAttr(field.key)}" placeholder="${LOCALE_LABELS[CE_state.locale]} value">${escapeHtml(current)}</textarea>`
        : `<input type="text" class="form-input i18n-input" ${ctxAttr} data-path="${escapeAttr(field.key)}" placeholder="${LOCALE_LABELS[CE_state.locale]} value" value="${escapeAttr(current)}">`;
    return `
        <div class="field-row field-row-i18n">
            <label>
                ${escapeHtml(field.label)}
                ${covLabel}
                <span class="i18n-toggle" title="Toggle between single string and 13-locale object">
                    <input type="checkbox" ${ctxAttr} data-path="${escapeAttr(field.key)}" ${!isString ? 'checked' : ''}>
                    <span>i18n</span>
                </span>
            </label>
            ${inputHtml}
        </div>`;
}

function updateCoverageBadge(inputEl) {
    const row = inputEl.closest('.field-row-i18n');
    if (!row) return;
    const ctx = inputEl.dataset.ctx || '';
    const path = inputEl.dataset.path;
    const root = resolveContext(ctx);
    const val = getPath(root, path);
    const cov = localeCoverage(val);
    const badge = row.querySelector('.coverage-badge');
    if (!badge) return;
    badge.classList.remove('is-string','is-full','is-partial','is-empty');
    if (cov.isString) { badge.classList.add('is-string'); badge.textContent = 'plain string'; }
    else {
        badge.classList.add(cov.n===cov.total?'is-full':(cov.n===0?'is-empty':'is-partial'));
        badge.textContent = `${cov.n}/${cov.total} translations`;
    }
}

function renderListBlock(listDef, items, suffix) {
    const blockId = `list-${suffix}`;
    return `
        <div class="content-list-block">
            <div class="content-list-header">
                <h4><i class="fas fa-list"></i> ${escapeHtml(listDef.label || 'Items')} <span class="muted">(${items.length})</span></h4>
                <button class="btn btn-primary btn-sm" data-action="add-${suffix}"><i class="fas fa-plus"></i> Add entry</button>
            </div>
            <div class="content-list-items" id="${blockId}">
                ${items.map((it, idx) => renderListItem(listDef, it, idx, suffix)).join('')}
            </div>
        </div>
    `;
}

function renderListItem(listDef, item, idx, suffix) {
    const ctx = `${listDef.key}#${idx}`;
    const summary = listDef.itemSummary ? listDef.itemSummary(item) : `Item #${idx+1}`;
    const fieldsHtml = listDef.itemSchema.map((f, fi) => renderField(f, getPath(item, f.key), `f-${suffix}-${idx}-${fi}`, ctx)).join('');
    return `
        <details class="content-list-item" data-suffix="${suffix}" data-index="${idx}">
            <summary>
                <span class="item-summary">${escapeHtml(summary || '(untitled)')}</span>
                <span class="item-actions">
                    <button class="btn btn-sm btn-secondary" data-action="move-up" title="Move up"><i class="fas fa-arrow-up"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="move-down" title="Move down"><i class="fas fa-arrow-down"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="duplicate" title="Duplicate"><i class="fas fa-clone"></i></button>
                    <button class="btn btn-sm btn-danger" data-action="delete" title="Delete"><i class="fas fa-trash"></i></button>
                </span>
            </summary>
            <div class="item-body">${fieldsHtml}</div>
        </details>
    `;
}

function wireFieldsEvents(rootObj, fields, ctx) {
    document.getElementById('content-editor-form').querySelectorAll('[data-path]').forEach(el => {
        wireInputEvent(el, ctx);
    });
}

function wireListEvents(listDef, items, suffix) {
    const container = document.getElementById(`list-${suffix}`);
    if (!container) return;

    // Add button (find by data-action since it's outside the items list)
    const addBtn = document.querySelector(`[data-action="add-${suffix}"]`);
    if (addBtn) addBtn.onclick = () => {
        const fresh = listDef.newItem ? listDef.newItem() : {};
        const list = getPath(CE_state.raw, listDef.key) || [];
        list.push(fresh);
        setPath(CE_state.raw, listDef.key, list);
        setDirty(true);
        // Re-render just this block
        const blockWrap = container.parentElement;
        blockWrap.outerHTML = renderListBlock(listDef, list, suffix);
        wireListEvents(listDef, list, suffix);
    };

    // Per-item actions (move/delete)
    container.querySelectorAll('.content-list-item').forEach(itemEl => {
        const idx = parseInt(itemEl.dataset.index, 10);
        itemEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const list = getPath(CE_state.raw, listDef.key) || [];
                const action = btn.dataset.action;
                if (action === 'delete') {
                    if (!confirm('Delete this entry?')) return;
                    list.splice(idx, 1);
                } else if (action === 'move-up' && idx > 0) {
                    [list[idx-1], list[idx]] = [list[idx], list[idx-1]];
                } else if (action === 'move-down' && idx < list.length - 1) {
                    [list[idx+1], list[idx]] = [list[idx], list[idx+1]];
                } else if (action === 'duplicate') {
                    const copy = JSON.parse(JSON.stringify(list[idx]));
                    // MOTD modern requires unique contentId/tcId per entry; freshen them.
                    if (copy.contentId) copy.contentId = `${copy.contentId}-copy-${Math.random().toString(36).slice(2, 6)}`;
                    if (copy.tcId)      copy.tcId = cryptoUuid();
                    if (copy.contentHash) copy.contentHash = 'neodyme-' + Math.random().toString(36).slice(2, 10);
                    list.splice(idx + 1, 0, copy);
                } else return;
                setPath(CE_state.raw, listDef.key, list);
                setDirty(true);
                const blockWrap = container.parentElement;
                blockWrap.outerHTML = renderListBlock(listDef, list, suffix);
                wireListEvents(listDef, list, suffix);
            };
        });

        itemEl.querySelectorAll('[data-path]').forEach(el => wireInputEvent(el, `${listDef.key}#${idx}`));
    });
}

function wireInputEvent(el, ctx) {
    el.dataset.ctx = ctx || '';
    const path = el.dataset.path;

    if (el.classList.contains('bool-input')) {
        el.onchange = () => { writeValue(ctx, path, el.checked); setDirty(true); };
        return;
    }
    if (el.classList.contains('select-input')) {
        el.onchange = () => { writeValue(ctx, path, el.value); setDirty(true); };
        return;
    }
    if (el.classList.contains('i18n-input')) {
        el.oninput = () => {
            const root = resolveContext(ctx);
            const cur = getPath(root, path);
            const toggle = el.parentElement.querySelector('.i18n-toggle input');
            const isI18n = toggle ? toggle.checked : (cur && typeof cur === 'object');
            if (isI18n) {
                const obj = (cur && typeof cur === 'object') ? cur : {};
                obj[CE_state.locale] = el.value;
                writeValue(ctx, path, obj);
            } else {
                writeValue(ctx, path, el.value);
            }
            setDirty(true);
            updateCoverageBadge(el);
        };
        // i18n toggle
        const toggle = el.parentElement.querySelector('.i18n-toggle input');
        if (toggle) {
            toggle.onchange = () => {
                const root = resolveContext(ctx);
                const cur = getPath(root, path);
                if (toggle.checked) {
                    const obj = (cur && typeof cur === 'object') ? cur : {};
                    if (typeof cur === 'string') obj.en = cur;
                    if (!obj[CE_state.locale]) obj[CE_state.locale] = el.value || '';
                    writeValue(ctx, path, obj);
                } else {
                    writeValue(ctx, path, (cur && typeof cur === 'object' ? (cur[CE_state.locale] || cur.en || '') : (cur || '')));
                }
                setDirty(true);
                updateCoverageBadge(el);
            };
        }
        return;
    }
    // simple text/number/url (incl. image-url, which also refreshes its thumb)
    el.oninput = () => {
        let v = el.value;
        if (el.type === 'number') v = v === '' ? null : Number(v);
        writeValue(ctx, path, v);
        setDirty(true);
        if (el.classList.contains('image-url-input')) refreshImageThumb(el);
    };

    if (el.classList.contains('image-url-input')) {
        const wrap = el.parentElement;
        wrap.querySelectorAll('.image-url-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const act = btn.dataset.act;
                if (act === 'browse') {
                    if (typeof openImagePicker !== 'function') return;
                    openImagePicker((url) => applyPickedImageUrl(el, url));
                } else if (act === 'upload') {
                    triggerInlineUpload(el);
                }
            };
        });
    }
}

function refreshImageThumb(el) {
    const thumb = el.parentElement.querySelector('.image-thumb');
    if (!thumb) return;
    thumb.classList.remove('broken');
    const v = el.value;
    if (v && /^https?:\/\//i.test(v)) {
        thumb.innerHTML = `<img src="${escapeAttr(v)}" alt="" onerror="this.parentElement.classList.add('broken');this.parentElement.title='Image not loading: '+this.src">`;
        thumb.removeAttribute('title');
    } else {
        thumb.innerHTML = '<span class="image-thumb-empty">no image</span>';
    }
}

function applyPickedImageUrl(el, url) {
    el.value = url;
    el.dispatchEvent(new Event('input'));
}

function triggerInlineUpload(el) {
    const tmpInput = document.createElement('input');
    tmpInput.type = 'file';
    tmpInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
    tmpInput.style.display = 'none';
    tmpInput.onchange = async () => {
        const f = tmpInput.files && tmpInput.files[0];
        tmpInput.remove();
        if (!f) return;
        const form = new FormData();
        form.append('file', f);
        try {
            const res = await secureFetch('/neodyme/api/dev/assets/upload', { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok || !data.success) {
                showContentMsg('error', apiError(data, 'Upload failed.'));
                return;
            }
            applyPickedImageUrl(el, data.file.url);
            showContentMsg('ok', 'Uploaded and linked.');
        } catch (err) {
            showContentMsg('error', err.message);
        }
    };
    document.body.appendChild(tmpInput);
    tmpInput.click();
}

function writeValue(ctx, path, value) {
    if (!ctx) {
        setPath(CE_state.raw, path, value);
        return;
    }
    const [listKey, idxStr] = ctx.split('#');
    const idx = parseInt(idxStr, 10);
    const list = getPath(CE_state.raw, listKey) || [];
    if (!list[idx]) list[idx] = {};
    setPath(list[idx], path, value);
}

async function saveCurrentEditor() {
    if (!CE_state.scope || !CE_state.section) return;
    const schema = SCHEMAS[`${CE_state.scope}:${CE_state.section}`];
    if (!schema) return;

    // MOTD modern: contentId is the client-side key for each entry. Duplicates
    // make the client pick one at random, which silently breaks the news feed.
    if (CE_state.scope === 'motd') {
        const items = getPath(CE_state.raw, 'contentItems') || [];
        const seen = new Map();
        for (let i = 0; i < items.length; i++) {
            const id = (items[i] && items[i].contentId || '').trim();
            if (!id) { showContentMsg('error', `Entry #${i+1}: contentId is required.`); return; }
            if (seen.has(id)) {
                showContentMsg('error', `Duplicate contentId "${id}" (entries #${seen.get(id)+1} and #${i+1}). Each MOTD must have a unique ID.`);
                return;
            }
            seen.set(id, i);
        }
    }

    let payload;
    try {
        if (schema.wrap && schema.twoLists) {
            const a = getPath(CE_state.raw, schema.listA.key) || [];
            const b = getPath(CE_state.raw, schema.listB.key) || [];
            payload = schema.wrap(a, b);
        } else if (schema.wrap && schema.listKey) {
            const items = getPath(CE_state.raw, schema.listKey) || [];
            payload = schema.wrap(items);
        } else {
            payload = CE_state.raw;
        }
    } catch (err) {
        showContentMsg('error', 'Failed to build payload: ' + err.message);
        return;
    }

    try {
        const res = await secureFetch(`/neodyme/api/dev/content/${CE_state.scope}/${CE_state.section}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: payload })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            showContentMsg('error', apiError(data, 'Save failed.'));
            return;
        }
        setDirty(false);
        showContentMsg('ok', 'Saved');
    } catch (err) {
        showContentMsg('error', err.message);
    }
}

function reloadCurrentEditor() {
    if (CE_state.dirty && !confirm('Discard unsaved changes?')) return;
    openContentEditor(CE_state.scope, CE_state.section);
}

// Reset the file backing the currently-open editor (motd or pages) from the
// GitHub repo defaults. The user picks the section, we reset the WHOLE file
// behind it - resetting just one section of a multi-section file (pages) would
// require parsing the upstream file server-side. Simpler and safer to refetch
// the canonical file.
async function resetCurrentContent() {
    if (!CE_state.scope) return;
    const label = CE_state.scope === 'motd'
        ? 'config/motd.json (all MOTD entries)'
        : 'content/pages/content-pages.json (ALL sections: login, news, notices, ...)';
    if (!confirm(`Reset ${label} from GitHub?\n\nAny local edits to this file will be lost.`)) return;
    await runReset([CE_state.scope], () => openContentEditor(CE_state.scope, CE_state.section));
}

async function resetAllContent() {
    if (!confirm('Reset BOTH config/motd.json AND content/pages/content-pages.json from GitHub?\n\nAll local edits to these files will be lost.')) return;
    await runReset(['motd', 'pages'], () => resetContentEditor());
}

async function runReset(scopes, onDone) {
    try {
        const res = await secureFetch('/neodyme/api/dev/content/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scopes })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            const msg = apiError(data, 'Reset failed.');
            if (typeof showAlert === 'function') showAlert(msg, 'error'); else showContentMsg('error', msg);
            return;
        }
        const failed = (data.results || []).filter(r => !r.ok);
        const successMsg = data.message || 'Reset done.';
        if (failed.length > 0) {
            const detail = failed.map(f => `${f.label}: ${f.error}`).join('\n');
            if (typeof showAlert === 'function') showAlert(successMsg + '\n\n' + detail, 'warning');
            else showContentMsg('error', successMsg);
        } else {
            if (typeof showAlert === 'function') showAlert(successMsg, 'success');
            else showContentMsg('ok', successMsg);
        }
        if (onDone) onDone();
    } catch (err) {
        if (typeof showAlert === 'function') showAlert(err.message, 'error');
        else showContentMsg('error', err.message);
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// Expose to global scope (admin.html uses inline onclick handlers)
window.addEventListener('beforeunload', (e) => {
    if (CE_state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

window.openContentEditor    = openContentEditor;
window.resetContentEditor   = resetContentEditor;
window.saveCurrentEditor    = saveCurrentEditor;
window.reloadCurrentEditor  = reloadCurrentEditor;
window.setEditorLocale      = setEditorLocale;
window.resetCurrentContent  = resetCurrentContent;
window.resetAllContent      = resetAllContent;
