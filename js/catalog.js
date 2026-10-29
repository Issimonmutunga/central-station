// Dataset catalog. Every entry links to the original publisher — nothing is re-hosted.
// access: 'direct' (open files, one-click), 'open' (open but via portal/API), 'login' (free account needed)

const FIELDS = [
  { id: 'climate', name: 'Climate', icon: 'thermostat', ready: true },
  { id: 'hydrology', name: 'Hydrology', icon: 'water_drop' },
  { id: 'land', name: 'Land cover', icon: 'forest' },
  { id: 'ocean', name: 'Oceans', icon: 'waves' },
  { id: 'atmosphere', name: 'Air quality', icon: 'air' },
  { id: 'soils', name: 'Soils & geology', icon: 'landslide' },
  { id: 'biodiversity', name: 'Biodiversity', icon: 'pets' },
  { id: 'hazards', name: 'Hazards', icon: 'flood' },
];

const CMIP6_WC_MODELS = ['ACCESS-CM2', 'BCC-CSM2-MR', 'CMCC-ESM2', 'EC-Earth3-Veg', 'FIO-ESM-2-0', 'GISS-E2-1-G', 'HadGEM3-GC31-LL', 'INM-CM5-0', 'IPSL-CM6A-LR', 'MIROC6', 'MPI-ESM1-2-HR', 'MRI-ESM2-0', 'UKESM1-0-LL'];
const CHELSA_MODELS = ['GFDL-ESM4', 'IPSL-CM6A-LR', 'MPI-ESM1-2-HR', 'MRI-ESM2-0', 'UKESM1-0-LL'];
const NEX_MODELS = ['ACCESS-CM2', 'ACCESS-ESM1-5', 'BCC-CSM2-MR', 'CanESM5', 'CESM2', 'CESM2-WACCM', 'CMCC-CM2-SR5', 'CMCC-ESM2', 'CNRM-CM6-1', 'CNRM-ESM2-1', 'EC-Earth3', 'EC-Earth3-Veg-LR', 'FGOALS-g3', 'GFDL-CM4', 'GFDL-CM4_gr2', 'GFDL-ESM4', 'GISS-E2-1-G', 'HadGEM3-GC31-LL', 'HadGEM3-GC31-MM', 'IITM-ESM', 'INM-CM4-8', 'INM-CM5-0', 'IPSL-CM6A-LR', 'KACE-1-0-G', 'KIOST-ESM', 'MIROC-ES2L', 'MIROC6', 'MPI-ESM1-2-HR', 'MPI-ESM1-2-LR', 'MRI-ESM2-0', 'NESM3', 'NorESM2-LM', 'NorESM2-MM', 'TaiESM1', 'UKESM1-0-LL'];

const SSP = {
  ssp126: 'SSP1-2.6 · low emissions', ssp245: 'SSP2-4.5 · intermediate',
  ssp370: 'SSP3-7.0 · high', ssp585: 'SSP5-8.5 · very high',
};
const opts = (arr, labels = {}) => arr.map(v => (typeof v === 'object' ? v : { value: v, label: labels[v] || v }));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pad = n => String(n).padStart(2, '0');
const MONTHS = range(1, 12).map(m => ({ value: pad(m), label: new Date(2000, m - 1).toLocaleString('en', { month: 'short' }) }));
const BIO = {
  1: 'Annual mean temperature', 2: 'Mean diurnal range', 3: 'Isothermality', 4: 'Temperature seasonality',
  5: 'Max temp of warmest month', 6: 'Min temp of coldest month', 7: 'Temperature annual range',
  8: 'Mean temp of wettest quarter', 9: 'Mean temp of driest quarter', 10: 'Mean temp of warmest quarter',
  11: 'Mean temp of coldest quarter', 12: 'Annual precipitation', 13: 'Precip of wettest month',
  14: 'Precip of driest month', 15: 'Precip seasonality', 16: 'Precip of wettest quarter',
  17: 'Precip of driest quarter', 18: 'Precip of warmest quarter', 19: 'Precip of coldest quarter',
};

// NEX-GDDP files carry model-specific members/grids and versioned re-releases (_v1.1, _v2.0),
// so the URL is resolved from the public S3 listing (which allows CORS) instead of guessed.
const NEX_BASE = 'https://nex-gddp-cmip6.s3-us-west-2.amazonaws.com';
async function s3List(prefix, delimiter) {
  const out = { keys: [], prefixes: [] };
  let marker = '';
  do {
    const q = new URLSearchParams({ prefix, 'max-keys': '1000' });
    if (delimiter) q.set('delimiter', delimiter);
    if (marker) q.set('marker', marker);
    const xml = new DOMParser().parseFromString(await (await fetch(`${NEX_BASE}/?${q}`)).text(), 'application/xml');
    xml.querySelectorAll('Contents').forEach(c => out.keys.push({ key: c.querySelector('Key').textContent, size: +c.querySelector('Size').textContent }));
    xml.querySelectorAll('CommonPrefixes > Prefix').forEach(p => out.prefixes.push(p.textContent));
    const trunc = xml.querySelector('IsTruncated')?.textContent === 'true';
    marker = trunc ? out.keys[out.keys.length - 1]?.key : '';
  } while (marker);
  return out;
}

const CATALOG = [
  // ---------------------------------------------------------------- scenarios / projections
  {
    id: 'worldclim-cmip6', field: 'climate', title: 'WorldClim 2.1 — CMIP6 future climate',
    provider: 'WorldClim / UC Davis', kind: 'Projection', access: 'direct', format: 'GeoTIFF', preview: true,
    resolution: '10′ · 5′ · 2.5′ · 30″', coverage: 'Global land', period: '2021–2100 (20-yr means)',
    tags: ['scenario', 'CMIP6', 'SSP', 'downscaled', 'bioclim', 'temperature', 'precipitation'],
    summary: 'Downscaled CMIP6 monthly min/max temperature, precipitation and 19 bioclimatic variables for 4 SSPs and 13 GCMs.',
    description: 'Bias-corrected, downscaled projections from 13 CMIP6 global climate models for four Shared Socio-economic Pathways, delivered as multi-band GeoTIFFs (12 monthly bands, or 19 bands for bioclim). Ideal for species distribution modelling, agriculture and impact studies.',
    license: 'Free for academic & non-commercial use; no redistribution', licenseUrl: 'https://www.worldclim.org/data/cmip6/cmip6climate.html',
    homepage: 'https://www.worldclim.org/data/cmip6/cmip6climate.html',
    citation: 'Fick, S.E. & Hijmans, R.J. (2017) WorldClim 2: new 1-km spatial resolution climate surfaces for global land areas. Int. J. Climatology 37: 4302–4315.',
    builder: {
      params: [
        { id: 'res', label: 'Resolution', type: 'select', options: opts(['10m', '5m', '2.5m', '30s'], { '10m': '10 min (~18 km)', '5m': '5 min (~9 km)', '2.5m': '2.5 min (~4.5 km)', '30s': '30 s (~1 km)' }), default: '10m' },
        { id: 'var', label: 'Variable', type: 'multi', options: opts(['tmin', 'tmax', 'prec', 'bioc'], { tmin: 'Min temperature', tmax: 'Max temperature', prec: 'Precipitation', bioc: 'Bioclimatic (19)' }), default: ['bioc'] },
        { id: 'ssp', label: 'Scenario', type: 'multi', options: opts(Object.keys(SSP), SSP), default: ['ssp245'] },
        { id: 'model', label: 'Climate model (GCM)', type: 'multi', options: opts(CMIP6_WC_MODELS), default: ['MPI-ESM1-2-HR'] },
        { id: 'period', label: 'Period', type: 'multi', options: opts(['2021-2040', '2041-2060', '2061-2080', '2081-2100']), default: ['2041-2060'] },
      ],
      url: p => `https://geodata.ucdavis.edu/cmip6/${p.res}/${p.model}/${p.ssp}/wc2.1_${p.res}_${p.var}_${p.model}_${p.ssp}_${p.period}.tif`,
      bands: p => (p.var === 'bioc' ? Object.values(BIO) : MONTHS.map(m => m.label)),
    },
  },
  {
    id: 'chelsa-future', field: 'climate', title: 'CHELSA V2.1 — CMIP6 future climatologies',
    provider: 'WSL Swiss Federal Research Institute', kind: 'Projection', access: 'direct', format: 'GeoTIFF', preview: true,
    resolution: '30″ (~1 km)', coverage: 'Global land', period: '2011–2100 (30-yr means)',
    tags: ['scenario', 'CMIP6', 'SSP', 'ISIMIP3b', 'downscaled', 'bioclim', 'high resolution'],
    summary: 'Kilometre-scale future climatologies (bioclim + monthly temperature & precipitation) from 5 ISIMIP3b GCMs and 3 SSPs.',
    description: 'Mechanistically downscaled CHELSA climatologies for 2011–2040, 2041–2070 and 2071–2100. Values are stored as scaled integers — use the visualizer\'s unit preset (e.g. “CHELSA temperature”) to convert to °C.',
    license: 'CC BY 4.0', licenseUrl: 'https://chelsa-climate.org/license/',
    homepage: 'https://chelsa-climate.org/cmip6/',
    citation: 'Karger, D.N. et al. (2017) Climatologies at high resolution for the earth\'s land surface areas. Scientific Data 4, 170122.',
    builder: {
      params: [
        { id: 'product', label: 'Product', type: 'select', options: opts(['bio', 'tas', 'tasmax', 'tasmin', 'pr'], { bio: 'Bioclimatic variable', tas: 'Monthly mean temp', tasmax: 'Monthly max temp', tasmin: 'Monthly min temp', pr: 'Monthly precipitation' }), default: 'bio' },
        { id: 'bio', label: 'Bioclim variable', type: 'multi', options: Object.entries(BIO).map(([k, v]) => ({ value: k, label: `bio${k} · ${v}` })), default: ['1', '12'], when: p => p.product === 'bio' },
        { id: 'month', label: 'Month', type: 'multi', options: MONTHS, default: ['01'], when: p => p.product !== 'bio' },
        { id: 'ssp', label: 'Scenario', type: 'multi', options: opts(['ssp126', 'ssp370', 'ssp585'], SSP), default: ['ssp585'] },
        { id: 'model', label: 'Climate model (GCM)', type: 'multi', options: opts(CHELSA_MODELS), default: ['MPI-ESM1-2-HR'] },
        { id: 'period', label: 'Period', type: 'multi', options: opts(['2011-2040', '2041-2070', '2071-2100']), default: ['2041-2070'] },
      ],
      url: p => {
        const base = `https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/${p.period}/${p.model}/${p.ssp}`;
        if (p.product === 'bio') return `${base}/bio/CHELSA_bio${p.bio}_${p.period}_${p.model.toLowerCase()}_${p.ssp}_V.2.1.tif`;
        return `${base}/${p.product}/CHELSA_${p.model.toLowerCase()}_r1i1p1f1_w5e5_${p.ssp}_${p.product}_${p.month}_${p.period.replace('-', '_')}_norm.tif`;
      },
      units: p => (p.product === 'pr' || ['12', '13', '14', '16', '17', '18', '19'].includes(p.bio) ? 'chelsa-pr' : ['tas', 'tasmax', 'tasmin'].includes(p.product) || ['1', '5', '6', '8', '9', '10', '11'].includes(p.bio) ? 'chelsa-temp' : null),
    },
  },
  {
    id: 'nex-gddp-cmip6', field: 'climate', title: 'NASA NEX-GDDP-CMIP6 — daily downscaled projections',
    provider: 'NASA Earth Exchange (AWS Open Data)', kind: 'Projection', access: 'direct', format: 'NetCDF', preview: false,
    resolution: '0.25° (~25 km)', coverage: 'Global', period: '1950–2014 historical · 2015–2100 SSPs',
    tags: ['scenario', 'CMIP6', 'SSP', 'daily', 'bias-corrected', 'extremes', 'heat', 'rainfall'],
    summary: 'Daily bias-corrected (BCSD) CMIP6 projections — 35 models, 9 variables, 4 SSPs. One file per year.',
    description: 'The go-to dataset for climate-extremes and impact analysis needing daily data. Files are yearly NetCDF (~150–250 MB each). The builder reads the public S3 listing to find each model\'s ensemble member, grid label and latest file version (v1.1/v2.0 fixes) automatically.',
    license: 'Public domain-like (NASA open data); please cite', licenseUrl: 'https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6',
    homepage: 'https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6',
    citation: 'Thrasher, B. et al. (2022) NASA Global Daily Downscaled Projections, CMIP6. Scientific Data 9, 262.',
    builder: {
      params: [
        { id: 'var', label: 'Variable', type: 'multi', options: opts(['tas', 'tasmax', 'tasmin', 'pr', 'hurs', 'huss', 'rsds', 'rlds', 'sfcWind'], { tas: 'tas · mean temp', tasmax: 'tasmax · max temp', tasmin: 'tasmin · min temp', pr: 'pr · precipitation', hurs: 'hurs · rel. humidity', huss: 'huss · spec. humidity', rsds: 'rsds · shortwave rad.', rlds: 'rlds · longwave rad.', sfcWind: 'sfcWind · wind speed' }), default: ['tas'] },
        { id: 'scenario', label: 'Scenario', type: 'multi', options: opts(['historical', ...Object.keys(SSP)], { historical: 'Historical (1950–2014)', ...SSP }), default: ['ssp245'] },
        { id: 'model', label: 'Climate model (GCM)', type: 'multi', options: opts(NEX_MODELS), default: ['ACCESS-CM2'] },
        { id: 'years', label: 'Years', type: 'years', min: 1950, max: 2100, default: [2050, 2050] },
      ],
      resolve: async (combos, years) => {
        const out = [];
        const groups = {};
        combos.forEach(c => { (groups[`${c.model}/${c.scenario}`] ||= []).push(c); });
        for (const [ms, cs] of Object.entries(groups)) {
          const members = (await s3List(`NEX-GDDP-CMIP6/${ms}/`, '/')).prefixes;
          if (!members.length) { out.push({ error: `${ms}: not available` }); continue; }
          const member = members[0];
          for (const c of cs) {
            const { keys } = await s3List(`${member}${c.var}/`);
            const [y0, y1] = c.scenario === 'historical' ? [Math.max(years[0], 1950), Math.min(years[1], 2014)] : [Math.max(years[0], 2015), Math.min(years[1], 2100)];
            if (y0 > y1) { out.push({ error: `${c.model} ${c.scenario}: no years in range` }); continue; }
            for (let y = y0; y <= y1; y++) {
              const ver = k => { const m = /_v(\d+)\.(\d+)\.nc$/.exec(k.key); return m ? +m[1] * 100 + +m[2] : 0; };
              const best = keys.filter(k => new RegExp(`_${y}(_v\\d+\\.\\d+)?\\.nc$`).test(k.key)).sort((a, b) => ver(a) - ver(b)).pop();
              if (best) out.push({ url: `${NEX_BASE}/${best.key}`, size: best.size });
              else out.push({ error: `${c.model} ${c.scenario} ${c.var} ${y}: missing` });
            }
          }
        }
        return out;
      },
    },
  },
  {
    id: 'cmip6-cds', field: 'climate', title: 'CMIP6 climate projections (Copernicus CDS)',
    provider: 'Copernicus Climate Change Service', kind: 'Projection', access: 'login', format: 'NetCDF',
    resolution: 'Native GCM grids (~100–250 km)', coverage: 'Global', period: '1850–2100',
    tags: ['scenario', 'CMIP6', 'SSP', 'raw GCM', 'monthly', 'daily'],
    summary: 'Raw (not downscaled) CMIP6 model output — subset by model, experiment, variable, time and area.',
    description: 'A curated CMIP6 subset with a request form and API. Requires a free ECMWF account and accepting the dataset licence once.',
    license: 'CC BY 4.0 / model-specific terms (shown on the dataset page)', licenseUrl: 'https://cds.climate.copernicus.eu/datasets/projections-cmip6?tab=overview',
    homepage: 'https://cds.climate.copernicus.eu/datasets/projections-cmip6',
    citation: 'Copernicus Climate Change Service, Climate Data Store (2021): CMIP6 climate projections. DOI: 10.24381/cds.c866074c',
    steps: 'cds', cdsBuilder: 'cmip6',
  },
  {
    id: 'cordex', field: 'climate', title: 'CORDEX regional climate projections',
    provider: 'WCRP CORDEX via Copernicus CDS / ESGF', kind: 'Projection', access: 'login', format: 'NetCDF',
    resolution: '0.11° – 0.44° (12–50 km)', coverage: 'Regional domains (Africa, Europe, S. Asia …)', period: '1950–2100',
    tags: ['scenario', 'regional', 'RCP', 'dynamical downscaling', 'Africa', 'Europe'],
    summary: 'Dynamically downscaled RCP scenarios from regional climate models for 14 world domains.',
    description: 'Best source for regional climate-model scenarios (e.g. CORDEX-Africa AFR-44, EURO-CORDEX EUR-11). Available on the Copernicus CDS (simplest) or ESGF nodes.',
    license: 'Mostly CC BY 4.0; some models non-commercial', licenseUrl: 'https://cordex.org/data-access/cordex-cmip5-data/cordex-cmip5-esgf/',
    homepage: 'https://cds.climate.copernicus.eu/datasets/projections-cordex-domains-single-levels',
    citation: 'Copernicus Climate Change Service (2019): CORDEX regional climate model data on single levels. DOI: 10.24381/cds.bc91edc3',
    steps: 'cordex',
  },
  {
    id: 'esgf', field: 'climate', title: 'ESGF — full CMIP6 / CMIP5 archive',
    provider: 'Earth System Grid Federation', kind: 'Projection', access: 'open', format: 'NetCDF',
    resolution: 'Native model grids', coverage: 'Global', period: '1850–2300',
    tags: ['scenario', 'CMIP6', 'CMIP5', 'raw GCM', 'all variables', 'wget scripts'],
    summary: 'The authoritative archive of every CMIP model run, variable and frequency.',
    description: 'Search with the Metagrid UI, add datasets to a cart, then download a generated wget script. Most CMIP6 data no longer requires login.',
    license: 'CC BY 4.0 (most CMIP6 models)', licenseUrl: 'https://pcmdi.llnl.gov/CMIP6/TermsOfUse/TermsOfUse6-2.html',
    homepage: 'https://aims2.llnl.gov/search',
    citation: 'Eyring, V. et al. (2016) Overview of the CMIP6 experimental design. Geosci. Model Dev. 9, 1937–1958.',
    steps: 'esgf',
  },
  {
    id: 'isimip', field: 'climate', title: 'ISIMIP3b bias-adjusted climate forcing',
    provider: 'ISIMIP / PIK', kind: 'Projection', access: 'open', format: 'NetCDF',
    resolution: '0.5°', coverage: 'Global', period: '1850–2100',
    tags: ['scenario', 'CMIP6', 'SSP', 'bias-adjusted', 'daily', 'impact models'],
    summary: 'Daily bias-adjusted GCM output (the forcing behind CHELSA future data) plus sector impact simulations.',
    description: 'Open repository with a faceted search, per-file links and a server-side cutout tool for countries/bounding boxes.',
    license: 'CC0 / CC BY 4.0', licenseUrl: 'https://www.isimip.org/gettingstarted/terms-of-use/',
    homepage: 'https://data.isimip.org/',
    citation: 'Lange, S. & Büchner, M. (2021) ISIMIP3b bias-adjusted atmospheric climate input data. ISIMIP Repository. DOI: 10.48364/ISIMIP.842396.1',
    steps: 'isimip',
  },
  {
    id: 'wb-cckp', field: 'climate', title: 'World Bank Climate Change Knowledge Portal',
    provider: 'World Bank Group', kind: 'Projection', access: 'open', format: 'NetCDF · CSV · Excel',
    resolution: '0.25° + country/sub-national aggregates', coverage: 'Global', period: '1950–2100',
    tags: ['scenario', 'CMIP6', 'country', 'indices', 'policy'],
    summary: 'Ready-made CMIP6 indicators (heat days, drought, rainfall extremes) aggregated per country and province.',
    description: 'Great for policy briefs and country profiles — download gridded indicators or tables directly from each country page.',
    license: 'CC BY 4.0', licenseUrl: 'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets',
    homepage: 'https://climateknowledgeportal.worldbank.org/download-data',
    citation: 'World Bank Group (2024) Climate Change Knowledge Portal. climateknowledgeportal.worldbank.org',
    steps: 'cckp',
  },

  // ---------------------------------------------------------------- baselines / observations
  {
    id: 'worldclim-baseline', field: 'climate', title: 'WorldClim 2.1 — historical climatology 1970–2000',
    provider: 'WorldClim / UC Davis', kind: 'Baseline', access: 'direct', format: 'GeoTIFF (zipped)', preview: true,
    resolution: '10′ · 5′ · 2.5′ · 30″', coverage: 'Global land', period: '1970–2000 average',
    tags: ['baseline', 'bioclim', 'temperature', 'precipitation', 'solar radiation', 'wind', 'elevation'],
    summary: 'The classic baseline: monthly temperature, precipitation, radiation, wind, vapour pressure and 19 bioclim layers.',
    description: 'Each zip holds one GeoTIFF per month (or per bioclim variable). The visualizer opens zips directly — pick the layer inside.',
    license: 'Free for academic & non-commercial use; no redistribution', licenseUrl: 'https://www.worldclim.org/data/worldclim21.html',
    homepage: 'https://www.worldclim.org/data/worldclim21.html',
    citation: 'Fick, S.E. & Hijmans, R.J. (2017) WorldClim 2. Int. J. Climatology 37: 4302–4315.',
    builder: {
      params: [
        { id: 'res', label: 'Resolution', type: 'select', options: opts(['10m', '5m', '2.5m', '30s'], { '10m': '10 min (~18 km)', '5m': '5 min (~9 km)', '2.5m': '2.5 min (~4.5 km)', '30s': '30 s (~1 km)' }), default: '10m' },
        { id: 'var', label: 'Variable', type: 'multi', options: opts(['tavg', 'tmin', 'tmax', 'prec', 'srad', 'wind', 'vapr', 'bio', 'elev'], { tavg: 'Mean temperature', tmin: 'Min temperature', tmax: 'Max temperature', prec: 'Precipitation', srad: 'Solar radiation', wind: 'Wind speed', vapr: 'Vapour pressure', bio: 'Bioclimatic (19)', elev: 'Elevation' }), default: ['tavg'] },
      ],
      url: p => `https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_${p.res}_${p.var}.zip`,
    },
  },
  {
    id: 'worldclim-monthly', field: 'climate', title: 'WorldClim 2.1 — historical monthly weather 1960–2021',
    provider: 'WorldClim / UC Davis (CRU-TS 4.06 downscaled)', kind: 'Observation', access: 'direct', format: 'GeoTIFF (zipped)', preview: true,
    resolution: '10′ · 5′ · 2.5′', coverage: 'Global land', period: '1960–2021 monthly',
    tags: ['observation', 'time series', 'monthly', 'temperature', 'precipitation', 'trend'],
    summary: 'Downscaled monthly min/max temperature and precipitation for every month since 1960, in 10-year bundles.',
    description: 'Useful for trend analysis and for matching field data to actual weather. Each zip contains 120 monthly GeoTIFFs (24 for 2020–2021).',
    license: 'Free for academic & non-commercial use; no redistribution', licenseUrl: 'https://www.worldclim.org/data/monthlywth.html',
    homepage: 'https://www.worldclim.org/data/monthlywth.html',
    citation: 'Harris, I. et al. (2020) CRU TS4; Fick & Hijmans (2017) WorldClim 2.',
    builder: {
      params: [
        { id: 'res', label: 'Resolution', type: 'select', options: opts(['10m', '5m', '2.5m'], { '10m': '10 min', '5m': '5 min', '2.5m': '2.5 min' }), default: '10m' },
        { id: 'var', label: 'Variable', type: 'multi', options: opts(['tmin', 'tmax', 'prec'], { tmin: 'Min temperature', tmax: 'Max temperature', prec: 'Precipitation' }), default: ['prec'] },
        { id: 'decade', label: 'Years', type: 'multi', options: opts(['1960-1969', '1970-1979', '1980-1989', '1990-1999', '2000-2009', '2010-2019', '2020-2021']), default: ['2010-2019'] },
      ],
      url: p => `https://geodata.ucdavis.edu/climate/worldclim/2_1/hist/cts4.06/${p.res}/wc2.1_cruts4.06_${p.res}_${p.var}_${p.decade}.zip`,
    },
  },
  {
    id: 'chelsa-baseline', field: 'climate', title: 'CHELSA V2.1 — climatology 1981–2010',
    provider: 'WSL Swiss Federal Research Institute', kind: 'Baseline', access: 'direct', format: 'GeoTIFF', preview: true,
    resolution: '30″ (~1 km)', coverage: 'Global land', period: '1981–2010 average',
    tags: ['baseline', 'bioclim', 'high resolution', 'temperature', 'precipitation'],
    summary: 'High-resolution baseline matching CHELSA future data — use the pair to compute change maps.',
    description: 'Single-band GeoTIFFs (~100–700 MB each at 1 km). Map previews of these large files take a little while to stream.',
    license: 'CC BY 4.0', licenseUrl: 'https://chelsa-climate.org/license/',
    homepage: 'https://chelsa-climate.org/',
    citation: 'Karger, D.N. et al. (2017) Scientific Data 4, 170122.',
    builder: {
      params: [
        { id: 'product', label: 'Product', type: 'select', options: opts(['bio', 'tas', 'tasmax', 'tasmin', 'pr'], { bio: 'Bioclimatic variable', tas: 'Monthly mean temp', tasmax: 'Monthly max temp', tasmin: 'Monthly min temp', pr: 'Monthly precipitation' }), default: 'bio' },
        { id: 'bio', label: 'Bioclim variable', type: 'multi', options: Object.entries(BIO).map(([k, v]) => ({ value: k, label: `bio${k} · ${v}` })), default: ['1'], when: p => p.product === 'bio' },
        { id: 'month', label: 'Month', type: 'multi', options: MONTHS, default: ['01'], when: p => p.product !== 'bio' },
      ],
      url: p => p.product === 'bio'
        ? `https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/bio/CHELSA_bio${p.bio}_1981-2010_V.2.1.tif`
        : `https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/${p.product}/CHELSA_${p.product}_${p.month}_1981-2010_V.2.1.tif`,
      units: p => (p.product === 'pr' || ['12', '13', '14', '16', '17', '18', '19'].includes(p.bio) ? 'chelsa-pr' : ['tas', 'tasmax', 'tasmin'].includes(p.product) || ['1', '5', '6', '8', '9', '10', '11'].includes(p.bio) ? 'chelsa-temp' : null),
    },
  },
  {
    id: 'chirps', field: 'climate', title: 'CHIRPS — rainfall estimates',
    provider: 'UC Santa Barbara Climate Hazards Center', kind: 'Observation', access: 'direct', format: 'GeoTIFF', preview: true,
    resolution: '0.05° (~5 km)', coverage: 'Quasi-global 50°S–50°N (v2) · 60°S–60°N (v3)', period: '1981–present',
    tags: ['observation', 'precipitation', 'rainfall', 'drought', 'satellite', 'monthly', 'Africa'],
    summary: 'Satellite + station blended rainfall — the standard for drought monitoring in the tropics.',
    description: 'Monthly and annual totals in mm. CHIRPS v3 is the current release; v2.0 remains for continuity. v2 monthly files are gzip-compressed — the visualizer unzips them automatically.',
    license: 'CC BY 4.0 / public domain', licenseUrl: 'https://www.chc.ucsb.edu/data/chirps',
    homepage: 'https://www.chc.ucsb.edu/data/chirps3',
    citation: 'Funk, C. et al. (2015) The climate hazards infrared precipitation with stations. Scientific Data 2, 150066.',
    builder: {
      params: [
        { id: 'version', label: 'Version', type: 'select', options: opts(['v3', 'v2'], { v3: 'CHIRPS v3 (current)', v2: 'CHIRPS v2.0' }), default: 'v3' },
        { id: 'step', label: 'Time step', type: 'select', options: opts(['monthly', 'annual'], { monthly: 'Monthly', annual: 'Annual' }), default: 'monthly' },
        { id: 'month', label: 'Month', type: 'multi', options: MONTHS, default: ['01'], when: p => p.step === 'monthly' },
        { id: 'years', label: 'Years', type: 'years', min: 1981, max: new Date().getFullYear() - 1, default: [2023, 2023] },
      ],
      url: p => {
        if (p.version === 'v3') return p.step === 'annual'
          ? `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/annual/global/tifs/chirps-v3.0.${p.year}.tif`
          : `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs/chirps-v3.0.${p.year}.${p.month}.tif`;
        return p.step === 'annual'
          ? `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_annual/tifs/chirps-v2.0.${p.year}.tif`
          : `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/chirps-v2.0.${p.year}.${p.month}.tif.gz`;
      },
    },
  },
  {
    id: 'terraclimate', field: 'climate', title: 'TerraClimate — monthly climate & water balance',
    provider: 'University of Idaho / Climatology Lab', kind: 'Observation', access: 'direct', format: 'NetCDF',
    resolution: '1/24° (~4 km)', coverage: 'Global land', period: '1958–present',
    tags: ['observation', 'water balance', 'drought', 'PDSI', 'evapotranspiration', 'soil moisture', 'monthly'],
    summary: 'Monthly temperature, precipitation, PET, AET, climatic water deficit, soil moisture, runoff, SWE and PDSI.',
    description: 'One NetCDF per variable per year (12 monthly slices). Excellent for drought and hydro-climate work.',
    license: 'CC0 public domain', licenseUrl: 'https://www.climatologylab.org/terraclimate.html',
    homepage: 'https://www.climatologylab.org/terraclimate.html',
    citation: 'Abatzoglou, J.T. et al. (2018) TerraClimate. Scientific Data 5, 170191.',
    builder: {
      params: [
        { id: 'var', label: 'Variable', type: 'multi', options: opts(['ppt', 'tmax', 'tmin', 'pet', 'aet', 'def', 'soil', 'q', 'swe', 'srad', 'vap', 'vpd', 'ws', 'PDSI'], { ppt: 'Precipitation', tmax: 'Max temperature', tmin: 'Min temperature', pet: 'Reference ET', aet: 'Actual ET', def: 'Climatic water deficit', soil: 'Soil moisture', q: 'Runoff', swe: 'Snow water equivalent', srad: 'Solar radiation', vap: 'Vapour pressure', vpd: 'Vapour pressure deficit', ws: 'Wind speed', PDSI: 'Palmer Drought Severity Index' }), default: ['ppt'] },
        { id: 'years', label: 'Years', type: 'years', min: 1958, max: new Date().getFullYear() - 1, default: [2023, 2023] },
      ],
      url: p => `http://thredds.northwestknowledge.net:8080/thredds/fileServer/TERRACLIMATE_ALL/data/TerraClimate_${p.var}_${p.year}.nc`,
    },
  },
  {
    id: 'gistemp', field: 'climate', title: 'NASA GISTEMP v4 — temperature anomalies',
    provider: 'NASA Goddard Institute for Space Studies', kind: 'Observation', access: 'direct', format: 'NetCDF (gz) · CSV',
    resolution: '2°', coverage: 'Global land + ocean', period: '1880–present monthly',
    tags: ['observation', 'temperature anomaly', 'global warming', 'trend'],
    summary: 'The long-running global surface temperature anomaly record (vs 1951–1980).',
    description: 'Gridded monthly anomalies and global/hemispheric mean tables.',
    license: 'Public domain (U.S. Government)', licenseUrl: 'https://data.giss.nasa.gov/gistemp/',
    homepage: 'https://data.giss.nasa.gov/gistemp/',
    citation: 'GISTEMP Team (2024) GISS Surface Temperature Analysis (GISTEMP), v4. NASA GISS.',
    builder: {
      params: [
        { id: 'file', label: 'File', type: 'multi', options: [
          { value: 'gistemp1200_GHCNv4_ERSSTv5.nc.gz', label: 'Gridded anomalies, 1200 km smoothing' },
          { value: 'gistemp250_GHCNv4.nc.gz', label: 'Gridded anomalies, 250 km (land)' },
          { value: 'tabledata_v4/GLB.Ts+dSST.csv', label: 'Global mean table (CSV)' },
          { value: 'tabledata_v4/NH.Ts+dSST.csv', label: 'Northern hemisphere table (CSV)' },
          { value: 'tabledata_v4/SH.Ts+dSST.csv', label: 'Southern hemisphere table (CSV)' },
        ], default: ['gistemp1200_GHCNv4_ERSSTv5.nc.gz'] },
      ],
      url: p => (p.file.startsWith('tabledata') ? `https://data.giss.nasa.gov/gistemp/${p.file}` : `https://data.giss.nasa.gov/pub/gistemp/${p.file}`),
    },
  },
  {
    id: 'berkeley-earth', field: 'climate', title: 'Berkeley Earth — gridded temperature',
    provider: 'Berkeley Earth', kind: 'Observation', access: 'direct', format: 'NetCDF',
    resolution: '1°', coverage: 'Global land + ocean', period: '1850–present monthly',
    tags: ['observation', 'temperature anomaly', 'global warming'],
    summary: 'Independent global temperature reconstruction with anomalies and climatology.',
    description: 'Large single NetCDF files (~450 MB) with monthly anomalies plus the 1951–1980 climatology.',
    license: 'CC BY 4.0', licenseUrl: 'https://berkeleyearth.org/data/',
    homepage: 'https://berkeleyearth.org/data/',
    citation: 'Rohde, R.A. & Hausfather, Z. (2020) The Berkeley Earth Land/Ocean Temperature Record. ESSD 12, 3469–3479.',
    builder: {
      params: [
        { id: 'file', label: 'File', type: 'multi', options: [
          { value: 'Land_and_Ocean_LatLong1.nc', label: 'Land + Ocean, 1° monthly' },
          { value: 'Land_and_Ocean_EqualArea.nc', label: 'Land + Ocean, equal-area' },
        ], default: ['Land_and_Ocean_LatLong1.nc'] },
      ],
      url: p => `https://berkeley-earth-temperature.s3.us-west-1.amazonaws.com/Global/Gridded/${p.file}`,
    },
  },
  {
    id: 'noaa-co2', field: 'climate', title: 'NOAA Mauna Loa CO₂ record',
    provider: 'NOAA Global Monitoring Laboratory', kind: 'Observation', access: 'direct', format: 'CSV',
    resolution: 'Station', coverage: 'Mauna Loa, Hawaiʻi + global marine mean', period: '1958–present',
    tags: ['observation', 'greenhouse gas', 'CO2', 'Keeling curve', 'time series'],
    summary: 'The Keeling curve: monthly and annual atmospheric CO₂ concentrations.',
    description: 'Small CSV tables, updated monthly.',
    license: 'Public domain (U.S. Government); please cite', licenseUrl: 'https://gml.noaa.gov/ccgg/trends/data.html',
    homepage: 'https://gml.noaa.gov/ccgg/trends/data.html',
    citation: 'Lan, X., Tans, P. & Thoning, K.W. Trends in globally-averaged CO2 determined from NOAA GML measurements.',
    builder: {
      params: [
        { id: 'file', label: 'File', type: 'multi', options: [
          { value: 'co2_mm_mlo.csv', label: 'Mauna Loa monthly' }, { value: 'co2_annmean_mlo.csv', label: 'Mauna Loa annual' },
          { value: 'co2_mm_gl.csv', label: 'Global monthly' }, { value: 'co2_annmean_gl.csv', label: 'Global annual' },
        ], default: ['co2_mm_mlo.csv'] },
      ],
      url: p => `https://gml.noaa.gov/webdata/ccgg/trends/co2/${p.file}`,
    },
  },
  {
    id: 'cru-ts', field: 'climate', title: 'CRU TS — gridded monthly climate',
    provider: 'University of East Anglia, Climatic Research Unit', kind: 'Observation', access: 'open', format: 'NetCDF',
    resolution: '0.5°', coverage: 'Global land', period: '1901–present',
    tags: ['observation', 'monthly', 'temperature', 'precipitation', 'PET', 'station-based'],
    summary: 'Station-interpolated monthly climate since 1901 — 10 variables including PET and frost days.',
    description: 'Version numbers change yearly, so the portal is the safest source. No login needed.',
    license: 'Open Government Licence', licenseUrl: 'https://crudata.uea.ac.uk/cru/data/hrg/',
    homepage: 'https://crudata.uea.ac.uk/cru/data/hrg/',
    citation: 'Harris, I. et al. (2020) Version 4 of the CRU TS monthly high-resolution gridded multivariate climate dataset. Scientific Data 7, 109.',
    steps: 'cru',
  },
  {
    id: 'era5', field: 'climate', title: 'ERA5 & ERA5-Land reanalysis',
    provider: 'ECMWF / Copernicus Climate Change Service', kind: 'Reanalysis', access: 'login', format: 'NetCDF · GRIB',
    resolution: '0.25° (ERA5) · 0.1° (ERA5-Land)', coverage: 'Global', period: '1940–present, hourly',
    tags: ['reanalysis', 'hourly', 'temperature', 'wind', 'precipitation', 'humidity', 'API'],
    summary: 'The most widely used reanalysis — hourly weather for 80+ years. Request builder generates ready-to-run Python.',
    description: 'Requires a free ECMWF account and API key. Use the request builder below to generate a cdsapi script for your area and years.',
    license: 'CC BY 4.0', licenseUrl: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview',
    homepage: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels',
    citation: 'Hersbach, H. et al. (2020) The ERA5 global reanalysis. QJRMS 146, 1999–2049.',
    steps: 'cds', cdsBuilder: 'era5',
  },
  {
    id: 'era5-arco', field: 'climate', title: 'ERA5 analysis-ready (Google Cloud, no login)',
    provider: 'Google Research · ARCO-ERA5', kind: 'Reanalysis', access: 'open', format: 'Zarr',
    resolution: '0.25°', coverage: 'Global', period: '1940–present',
    tags: ['reanalysis', 'cloud-native', 'zarr', 'xarray', 'python'],
    summary: 'Full ERA5 as cloud-optimized Zarr — stream only the region and time you need with Python.',
    description: 'No account needed. Best for programmatic subsetting; the steps include a copy-paste xarray snippet.',
    license: 'CC BY 4.0 (ERA5 terms)', licenseUrl: 'https://github.com/google-research/arco-era5',
    homepage: 'https://github.com/google-research/arco-era5',
    citation: 'Carver, R.W. & Merose, A. (2023) ARCO-ERA5: An Analysis-Ready Cloud-Optimized Reanalysis Dataset.',
    steps: 'arco',
  },
  {
    id: 'imerg', field: 'climate', title: 'NASA GPM IMERG — satellite precipitation',
    provider: 'NASA GES DISC', kind: 'Observation', access: 'login', format: 'NetCDF · HDF5 · GeoTIFF',
    resolution: '0.1°', coverage: 'Global', period: '2000–present, 30-min to monthly',
    tags: ['observation', 'precipitation', 'satellite', 'half-hourly', 'extremes'],
    summary: 'High-frequency global rainfall from the GPM satellite constellation.',
    description: 'Needs a free NASA Earthdata login. GES DISC offers subsetting by region and variable.',
    license: 'Public domain (NASA open data)', licenseUrl: 'https://www.earthdata.nasa.gov/engage/open-data-services-software-policies',
    homepage: 'https://disc.gsfc.nasa.gov/datasets?keywords=IMERG',
    citation: 'Huffman, G.J. et al. (2023) GPM IMERG Final Precipitation L3 V07. NASA GES DISC.',
    steps: 'earthdata',
  },
  {
    id: 'merra2', field: 'climate', title: 'NASA MERRA-2 reanalysis',
    provider: 'NASA GMAO / GES DISC', kind: 'Reanalysis', access: 'login', format: 'NetCDF',
    resolution: '0.5° × 0.625°', coverage: 'Global', period: '1980–present, hourly',
    tags: ['reanalysis', 'aerosols', 'hourly', 'radiation'],
    summary: 'NASA\'s reanalysis, notable for assimilated aerosols and radiation fields.',
    description: 'Needs a free NASA Earthdata login.',
    license: 'Public domain (NASA open data)', licenseUrl: 'https://www.earthdata.nasa.gov/engage/open-data-services-software-policies',
    homepage: 'https://disc.gsfc.nasa.gov/datasets?project=MERRA-2',
    citation: 'Gelaro, R. et al. (2017) The MERRA-2 reanalysis. J. Climate 30, 5419–5454.',
    steps: 'earthdata',
  },
  {
    id: 'daymet', field: 'climate', title: 'Daymet V4 — daily surface weather (N. America)',
    provider: 'ORNL DAAC', kind: 'Observation', access: 'login', format: 'NetCDF · CSV',
    resolution: '1 km', coverage: 'North America, Hawaiʻi, Puerto Rico', period: '1980–present daily',
    tags: ['observation', 'daily', 'North America', 'high resolution'],
    summary: 'Daily 1-km temperature, precipitation, humidity, radiation and snow for North America.',
    description: 'Single-pixel CSV extraction is open; gridded downloads need a free NASA Earthdata login.',
    license: 'Public domain (NASA open data)', licenseUrl: 'https://daymet.ornl.gov/',
    homepage: 'https://daymet.ornl.gov/',
    citation: 'Thornton, M.M. et al. (2022) Daymet: Daily Surface Weather Data on a 1-km Grid for North America, V4 R1. ORNL DAAC.',
    steps: 'earthdata',
  },
  {
    id: 'prism', field: 'climate', title: 'PRISM — US climate (800 m / 4 km)',
    provider: 'Oregon State University', kind: 'Observation', access: 'open', format: 'GeoTIFF · BIL',
    resolution: '800 m · 4 km', coverage: 'Conterminous USA', period: '1895–present',
    tags: ['observation', 'normals', 'USA', 'daily', 'monthly', 'high resolution'],
    summary: 'Authoritative US climate grids and 1991–2020 normals.',
    description: 'Free with attribution via the PRISM website and web service.',
    license: 'Free with attribution', licenseUrl: 'https://prism.oregonstate.edu/terms/',
    homepage: 'https://prism.oregonstate.edu/',
    citation: 'PRISM Climate Group, Oregon State University, https://prism.oregonstate.edu',
    steps: 'prism',
  },
  {
    id: 'spei', field: 'climate', title: 'SPEIbase — drought index',
    provider: 'CSIC (Spanish National Research Council)', kind: 'Index', access: 'open', format: 'NetCDF',
    resolution: '0.5°', coverage: 'Global', period: '1901–present',
    tags: ['index', 'drought', 'SPEI', 'monthly', 'water balance'],
    summary: 'Standardised Precipitation-Evapotranspiration Index at 1–48 month timescales.',
    description: 'One NetCDF per timescale. Downloads from the SPEI website (no login).',
    license: 'Open (ODbL)', licenseUrl: 'https://spei.csic.es/database.html',
    homepage: 'https://spei.csic.es/database.html',
    citation: 'Beguería, S. et al. (2014) Standardized precipitation evapotranspiration index revisited. Int. J. Climatology 34, 3001–3023.',
    steps: 'portal',
  },
  {
    id: 'sea-ice', field: 'climate', title: 'NSIDC Sea Ice Index',
    provider: 'National Snow and Ice Data Center', kind: 'Observation', access: 'open', format: 'GeoTIFF · CSV · Shapefile',
    resolution: '25 km', coverage: 'Arctic & Antarctic', period: '1978–present daily',
    tags: ['observation', 'cryosphere', 'sea ice', 'polar'],
    summary: 'Daily and monthly sea-ice extent and concentration images, rasters and tables.',
    description: 'Open HTTPS file server — browse by hemisphere, product and month. Rasters are in polar stereographic projection.',
    license: 'Open; please cite', licenseUrl: 'https://nsidc.org/data/g02135',
    homepage: 'https://noaadata.apps.nsidc.org/NOAA/G02135/',
    citation: 'Fetterer, F. et al. (2017, updated daily) Sea Ice Index, Version 3. NSIDC. DOI: 10.7265/N5K072F8',
    steps: 'portal',
  },
];

// Step-by-step guides for sources that need an account or a portal.
const GUIDES = {
  cds: {
    title: 'Copernicus Climate Data Store (free ECMWF account)',
    steps: [
      ['Create an account', 'Go to <a href="https://cds.climate.copernicus.eu" target="_blank" rel="noopener">cds.climate.copernicus.eu</a> → <b>Login/Register</b>. Registration is free.'],
      ['Accept the dataset licence', 'Open the dataset page → <b>Download</b> tab → scroll to <b>Terms of use</b> and click <b>Accept</b>. This is needed once per dataset.'],
      ['Option A — download in the browser', 'Tick variables, years, months, days, area and format on the Download tab, then <b>Submit form</b>. Collect the file from <b>Your requests</b>.'],
      ['Option B — API (best for big requests)', 'Copy your key from your profile page into <code>%USERPROFILE%\\.cdsapirc</code> (Windows) or <code>~/.cdsapirc</code>:<pre>url: https://cds.climate.copernicus.eu/api\nkey: &lt;your-personal-access-token&gt;</pre>Then <code>pip install "cdsapi>=0.7.4"</code> and run a script (use the generator below).'],
    ],
  },
  cordex: {
    title: 'CORDEX regional projections',
    steps: [
      ['Simplest route: Copernicus CDS', 'Follow the CDS steps (free account + accept licence) on <a href="https://cds.climate.copernicus.eu/datasets/projections-cordex-domains-single-levels" target="_blank" rel="noopener">the CORDEX dataset page</a>.'],
      ['Pick the domain', 'e.g. <b>Africa</b> (AFR-44, ~50 km), <b>Europe</b> (EUR-11, ~12 km). Then choose experiment (historical, RCP 2.6/4.5/8.5), driving GCM, RCM, variable and period.'],
      ['Full archive: ESGF', 'More models/variables live on ESGF (see the ESGF entry). Filter <b>Project = CORDEX</b> and your domain.'],
    ],
  },
  esgf: {
    title: 'ESGF Metagrid (CMIP6 full archive)',
    steps: [
      ['Open the search', 'Go to <a href="https://aims2.llnl.gov/search" target="_blank" rel="noopener">aims2.llnl.gov/search</a> (or the DKRZ / CEDA mirror).'],
      ['Filter facets', 'Set <b>Activity</b> (ScenarioMIP for SSPs, CMIP for historical), <b>Experiment ID</b> (ssp245…), <b>Variable</b> (tas, pr…), <b>Frequency</b> (mon/day) and <b>Source ID</b> (model).'],
      ['Add to cart', 'Select datasets → <b>Add to cart</b> → open the Cart.'],
      ['Download', 'Click <b>Download → wget</b>. Run the script in Git Bash / WSL: <pre>bash wget-script.sh -s</pre>The <code>-s</code> flag skips login for openly published data.'],
    ],
  },
  isimip: {
    title: 'ISIMIP Repository (no login)',
    steps: [
      ['Search', 'Open <a href="https://data.isimip.org/" target="_blank" rel="noopener">data.isimip.org</a> → <b>ISIMIP3b → InputData → climate → atmosphere</b>.'],
      ['Filter', 'Choose climate forcing (GCM), climate scenario (ssp126/370/585), variable and time step.'],
      ['Download or cut out', 'Download files directly, or use <b>Configure download → Cut out bounding box / country / landonly</b> to get a much smaller file.'],
    ],
  },
  cckp: {
    title: 'World Bank CCKP',
    steps: [
      ['Open Download Data', 'Go to <a href="https://climateknowledgeportal.worldbank.org/download-data" target="_blank" rel="noopener">CCKP → Download Data</a>.'],
      ['Choose collection', 'Pick <b>CMIP6</b> (projections) or <b>ERA5 / CRU</b> (historical), then the variable / index, scenario and aggregation.'],
      ['Download', 'Download gridded NetCDF, or go to a country page for CSV/Excel tables and charts.'],
    ],
  },
  cru: {
    title: 'CRU TS (no login)',
    steps: [
      ['Open the CRU data page', 'Go to <a href="https://crudata.uea.ac.uk/cru/data/hrg/" target="_blank" rel="noopener">crudata.uea.ac.uk/cru/data/hrg</a> and click the newest <b>cru_ts4.xx</b> link.'],
      ['Pick variable', 'Choose <b>Data → cru_ts4.xx → data → tmp / pre / pet …</b>.'],
      ['Download', 'Choose the full-period file (<code>.nc.gz</code>) or decadal chunks. Gunzip, then open in QGIS or Python.'],
    ],
  },
  earthdata: {
    title: 'NASA Earthdata (free login)',
    steps: [
      ['Register', 'Create a free account at <a href="https://urs.earthdata.nasa.gov/users/new" target="_blank" rel="noopener">urs.earthdata.nasa.gov</a>.'],
      ['Authorize the archive', 'In your Earthdata profile → <b>Applications → Authorized Apps</b>, approve <b>NASA GESDISC DATA ARCHIVE</b> (for IMERG / MERRA-2) or <b>ORNL DAAC</b> (for Daymet).'],
      ['Find & subset', 'Open the dataset page → <b>Subset / Get Data</b>. Choose dates, bounding box and variables. Pick NetCDF or GeoTIFF output where offered.'],
      ['Download the file list', 'Download the generated <code>links.txt</code>, then run:<pre>wget --load-cookies ~/.urs_cookies --save-cookies ~/.urs_cookies --keep-session-cookies --user=YOUR_USER --ask-password -i links.txt</pre>Or use <code>pip install earthaccess</code> for Python.'],
    ],
  },
  arco: {
    title: 'ARCO-ERA5 with Python (no login)',
    steps: [
      ['Install', '<pre>pip install xarray zarr gcsfs</pre>'],
      ['Open & subset', '<pre>import xarray as xr\nds = xr.open_zarr(\n  "gs://gcp-public-data-arco-era5/ar/full_37-1h-0p25deg-chunk-1.zarr-v3",\n  chunks=None, storage_options=dict(token="anon"))\nt2m = ds["2m_temperature"].sel(\n  time=slice("2023-01-01", "2023-01-31"),\n  latitude=slice(5, -5), longitude=slice(33, 42))\nt2m.to_netcdf("era5_t2m_jan2023.nc")</pre>'],
      ['Tip', 'ERA5 longitudes run 0–360 and latitude is descending — slice accordingly.'],
    ],
  },
  prism: {
    title: 'PRISM',
    steps: [
      ['Open data explorer', 'Go to <a href="https://prism.oregonstate.edu/" target="_blank" rel="noopener">prism.oregonstate.edu</a> → <b>Data</b>.'],
      ['Choose product', 'Pick Recent Years / Normals / Historical, variable and resolution (4 km is free for all years; 800 m availability varies).'],
      ['Download', 'Download the zipped grids. Cite PRISM in any publication.'],
    ],
  },
  portal: {
    title: 'Download from the publisher',
    steps: [
      ['Open the data page', 'Use the <b>Open website</b> button above.'],
      ['Pick files', 'Select the product, time step and file you need. No login is required.'],
      ['Visualize', 'GeoTIFFs can be dropped straight into the <b>Visualize</b> tab here.'],
    ],
  },
};
