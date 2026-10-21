import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import { css } from '@emotion/react';
import { Feature } from 'geojson';
import throttle from 'just-throttle';
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { StaticMap } from 'react-map-gl';
import { useUID } from 'react-uid';

import Logo from '../../assets/logo.svg';
import Octicon from '../../assets/octicon.svg';
import { API_NAME_TO_API_ID, COUNTRIES, STATUSES } from './constants';
import countriesGeoJson from './countries.geo.json';
import CountryTooltip, { SelectedCountry } from './CountryTooltip';
import { linkCss, linkIconCss } from './css';
import ProvinceTooltip, { SelectedProvince } from './ProvinceTooltip';
import { ApiDatum, ApiSummary, Covid19Data, Province, Summary } from './types';

const MAPBOX_ACCESS_TOKEN = process.env.GATSBY_MAPBOX_ACCESS_TOKEN;

const INITIAL_VIEW_STATE = {
  longitude: -97,
  latitude: 39,
  zoom: 3.8,
};

const LINE_WIDTH_MAX_PIXELS = 100;

const addCovid19Data = ({
  covid19Data,
  country,
  data,
}: {
  covid19Data: Covid19Data;
  country: string;
  data: ApiDatum[];
}): Covid19Data => ({
  ...covid19Data,
  [country]: data.reduce((acc, datum) => {
    const date = new Date(datum.Date).valueOf();

    // initialize nextProvince
    acc[datum.Province] = acc[datum.Province] || {
      name: datum.Province,
      coordinates: [datum.Lon, datum.Lat],
      minDates: {},
      maxDates: {},
      data: {},
    };
    const nextProvince = acc[datum.Province];

    // update nextProvince
    nextProvince.minDates[datum.Status] = !nextProvince.minDates[datum.Status]
      ? date
      : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Math.min(nextProvince.minDates[datum.Status]!, date);
    nextProvince.maxDates[datum.Status] = !nextProvince.maxDates[datum.Status]
      ? date
      : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Math.max(nextProvince.maxDates[datum.Status]!, date);

    // initialize nextData
    nextProvince.data[date] = nextProvince.data[date] || {};
    const nextData = nextProvince.data[date];

    // update nextData
    nextData[datum.Status] = datum.Cases;

    return acc;
  }, covid19Data[country] || {}),
});

enum Covid19DataActionType {
  Add,
}

type Covid19DataAction = {
  type: Covid19DataActionType.Add;
  country: string;
  data: ApiDatum[];
};

const covid19DataReducer = (
  covid19Data: Covid19Data,
  { type, country, data }: Covid19DataAction,
): Covid19Data => {
  if (type === Covid19DataActionType.Add) {
    return addCovid19Data({ covid19Data, country, data });
  }
  return { ...covid19Data };
};

const Map = (): JSX.Element | null => {
  const [country, setCountry] = useState<string>('us');
  const [covid19Data, dispatchCovid19Data] = useReducer(covid19DataReducer, {});
  const [
    selectedProvince,
    setSelectedProvince,
  ] = useState<SelectedProvince | null>(null);
  const [
    selectedCountry,
    setSelectedCountry,
  ] = useState<SelectedCountry | null>(null);
  const [isHovered, setHovered] = useState<boolean>(false);
  const [isClicked, setClicked] = useState<boolean>(false);
  const [isCountryHovered, setCountryHovered] = useState<boolean>(false);
  const [summary, setSummary] = useState<Summary>({
    Countries: {},
    Date: null,
  });

  const countriesLayerUid = useUID();
  const confirmedLayerUid = useUID();
  const deathsLayerUid = useUID();

  useEffect(() => {
    fetch('https://api.covid19api.com/summary')
      .then(res => res.json())
      .then((data: ApiSummary | null) => {
        if (!data) {
          return;
        }
        setSummary({
          Countries: data.Countries.reduce((acc, c) => {
            const apiId = API_NAME_TO_API_ID[c.Country];
            if (apiId) {
              acc[apiId] = c;
            }
            return acc;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }, {} as any),
          Date: data.Date,
        });
      });
  }, []);

  useEffect(() => {
    if (covid19Data[country]) {
      // already fetched data
      return;
    }

    STATUSES.forEach(status => {
      fetch(
        `https://api.covid19api.com/dayone/country/${country}/status/${status}/live`,
      )
        .then(res => res.json())
        .then((data: ApiDatum[] | null | {}) => {
          if (!Array.isArray(data)) {
            return;
          }
          dispatchCovid19Data({
            type: Covid19DataActionType.Add,
            country,
            data,
          });
        });
    });
  }, [covid19Data, country]);

  const countriesLayer = useMemo(
    () =>
      summary.Date &&
      new GeoJsonLayer({
        id: countriesLayerUid,
        data: countriesGeoJson,
        pickable: true,
        stroked: true,
        lineWidthUnits: 'pixels',
        getFillColor: (d: Feature<null, { name: string }>) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const { apiId, apiName, name } = COUNTRIES[d.id!];
          const summaryCountry = summary.Countries[apiId];
          const alpha =
            isCountryHovered &&
            selectedCountry?.summaryCountry.Country === (apiName || name)
              ? 200
              : !apiId ||
                apiId === country ||
                !summaryCountry ||
                !summaryCountry.TotalConfirmed
              ? 0
              : ~~(Math.log10(summaryCountry.TotalConfirmed) * 20);
          return [0, 124, 254, alpha];
        },
        onHover: ({
          object: d,
          x,
          y,
        }: {
          object: Feature<null, { name: string }>;
          x: number;
          y: number;
        }) => {
          if (!d) {
            setCountryHovered(false);
            return;
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion,@typescript-eslint/no-explicit-any
          const { apiId, apiName, name } = (COUNTRIES as any)[d.id!];
          if (apiId === country) {
            setCountryHovered(false);
            return;
          }
          const summaryCountry = apiId
            ? summary.Countries[apiId]
            : {
                Country: apiName || name,
              };
          setSelectedCountry({
            summaryCountry,
            x,
            y,
          });
          setCountryHovered(true);
        },
        onClick: ({
          object: d,
        }: {
          object: Feature<null, { name: string }>;
          x: number;
          y: number;
        }) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion,@typescript-eslint/no-explicit-any
          const { apiId } = (COUNTRIES as any)[d.id!];
          if (apiId) {
            setCountryHovered(false);
            setCountry(apiId);
          }
          return true;
        },
        updateTriggers: {
          getFillColor: [
            countriesLayerUid,
            country,
            isCountryHovered,
            selectedCountry,
            summary,
          ],
        },
      }),
    [countriesLayerUid, country, isCountryHovered, selectedCountry, summary],
  );

  // noinspection JSUnusedGlobalSymbols
  const confirmedLayer = useMemo(
    () =>
      covid19Data[country] &&
      new ScatterplotLayer({
        id: confirmedLayerUid,
        data: Object.keys(covid19Data[country])
          .map<Province>(k => covid19Data[country][k])
          .filter(province => province.maxDates.confirmed),
        pickable: true,
        stroked: true,
        filled: false,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 8,
        lineWidthMaxPixels: LINE_WIDTH_MAX_PIXELS,
        getPosition: (d: Province) => d.coordinates,
        getRadius: 0,
        getLineWidth: (d: Province) =>
          (!d.maxDates.deaths
            ? 0
            : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              Math.sqrt(d.data[d.maxDates.deaths!].deaths!)) +
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          Math.sqrt(d.data[d.maxDates.confirmed!].confirmed!),
        getLineColor: [0, 124, 254, 200],
        onHover: ({
          object: province,
          x,
          y,
        }: {
          object: Province;
          x: number;
          y: number;
        }) => {
          if (isClicked || !province) {
            setHovered(false);
            return;
          }

          setSelectedProvince({
            province,
            x,
            y,
          });
          setHovered(true);
        },
        onClick: ({
          object: province,
          x,
          y,
        }: {
          object: Province;
          x: number;
          y: number;
        }) => {
          setSelectedProvince({
            province,
            x,
            y,
          });
          setClicked(true);
          return true;
        },
      }),
    [covid19Data, country, confirmedLayerUid, isClicked],
  );

  const deathsLayer = useMemo(
    () =>
      covid19Data[country] &&
      new ScatterplotLayer({
        id: deathsLayerUid,
        data: Object.keys(covid19Data[country])
          .map<Province>(k => covid19Data[country][k])
          .filter(province => province.maxDates.deaths),
        stroked: true,
        filled: false,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 4,
        getPosition: (d: Province) => d.coordinates,
        getRadius: 0,
        getLineWidth: (d: Province) => {
          const deathsLineWidth = Math.sqrt(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            d.data[d.maxDates.deaths!].deaths!,
          );

          const confirmedLineWidth =
            deathsLineWidth +
            (!d.maxDates.confirmed
              ? 0
              : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                Math.sqrt(d.data[d.maxDates.confirmed!].confirmed!));

          const clampedRatio =
            LINE_WIDTH_MAX_PIXELS /
            Math.max(LINE_WIDTH_MAX_PIXELS, confirmedLineWidth);

          return (
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clampedRatio * Math.sqrt(d.data[d.maxDates.deaths!].deaths!)
          );
        },
        getLineColor: [255, 79, 122, 200],
      }),
    [covid19Data, country, deathsLayerUid],
  );

  return (
    <>
      <DeckGL
        getCursor={() => (isHovered || isCountryHovered ? 'pointer' : 'grab')}
        initialViewState={INITIAL_VIEW_STATE}
        controller
        onViewStateChange={throttle(({ interactionState: { isZooming } }) => {
          if (isZooming) {
            setClicked(false);
            setHovered(false);
            setCountryHovered(false);
          }
        }, 20)}
        layers={[countriesLayer, confirmedLayer, deathsLayer]}
        onClick={() => {
          setClicked(false);
        }}
        onDrag={throttle((
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          info: any,
          event: {
            deltaX: number;
            deltaY: number;
          },
        ) => {
          if (selectedProvince) {
            setSelectedProvince({
              province: selectedProvince.province,
              x: selectedProvince.x,
              y: selectedProvince.y,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
            });
          }
          if (selectedCountry) {
            setSelectedCountry({
              summaryCountry: selectedCountry.summaryCountry,
              x: selectedCountry.x,
              y: selectedCountry.y,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
            });
          }
        }, 20)}
      >
        <StaticMap
          mapboxApiAccessToken={MAPBOX_ACCESS_TOKEN}
          width="100%"
          height="100%"
        />
      </DeckGL>
      {(isHovered || isClicked) && selectedProvince && (
        <ProvinceTooltip selectedProvince={selectedProvince} />
      )}
      {isCountryHovered && selectedCountry && (
        <CountryTooltip selectedCountry={selectedCountry} />
      )}
      <section
        css={css`
          position: absolute;
          margin: 16px;
          padding: 16px;
          background: #fffc;
        `}
      >
        <h1
          css={css`
            font-size: 20px;
            margin: 0;
          `}
        >
          COVID19 API Map
          <div
            css={css`
              float: right;
              margin-left: 16px;
            `}
          >
            <a
              href="https://covid19api.com/"
              target="_blank"
              rel="noopener noreferrer"
              css={linkCss}
              title="Data"
            >
              <img src={Logo} alt="covid19api logo" css={linkIconCss} />
            </a>
            <a
              href="https://github.com/leyanlo/covid19api"
              target="_blank"
              rel="noopener noreferrer"
              css={linkCss}
              title="Code"
            >
              <img src={Octicon} alt="GitHub logo" css={linkIconCss} />
            </a>
          </div>
        </h1>
      </section>
    </>
  );
};
export default Map;
