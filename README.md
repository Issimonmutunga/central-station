# Central Station

A hub for finding, downloading and visualizing open earth-science datasets. It starts with climate: CMIP6 scenarios, baselines, observations and reanalysis.

## Run

```bash
node server.js
```

Open http://localhost:8787. Node 18+ is needed, with no dependencies.

The local helper (`server.js`) adds:
- one-click downloads into `./downloads`, with progress and resume
- map previews of remote GeoTIFFs, streamed through an allow-listed proxy
- file-size and availability checks

Without the helper (for example on a static host), these still work: the catalog, URL builders, PowerShell/Bash/URL-list scripts, the Copernicus API generator, and the map for local files.

## What's inside

- **Direct downloads:** WorldClim 2.1 (CMIP6 future, baseline, monthly), CHELSA V2.1 (baseline and future), NASA NEX-GDDP-CMIP6, CHIRPS v2/v3, TerraClimate, GISTEMP, Berkeley Earth, NOAA CO₂
- **Step-by-step guides** for sources that need a login or a portal: Copernicus CDS (ERA5, CMIP6, CORDEX), ESGF, ISIMIP, NASA Earthdata (IMERG, MERRA-2, Daymet), CRU TS, PRISM, SPEI, NSIDC, World Bank CCKP, ARCO-ERA5
- **Visualizer:** GeoTIFF, `.tif.gz` and `.zip` files; classification by quantile, equal interval, Jenks, pretty breaks, standard deviation or manual breaks (draggable on the histogram); editable class colours; 19 colour ramps; exports to PNG, georeferenced PNG, a QGIS colour map, or a scheme JSON

## Licences

Nothing is re-hosted. Files come straight from each publisher, and the publisher's licence applies. Each dataset page shows its licence and citation. WorldClim is for non-commercial use only.
