import { ScatterplotLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import { css } from '@emotion/core';
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { StaticMap } from 'react-map-gl';
import { useUID } from 'react-uid';
import { StringParam, useQueryParam } from 'use-query-params';

import Logo from '../../assets/logo.svg';
import Octicon from '../../assets/octicon.svg';
import { COUNTRIES, STATUSES } from './constants';
import { linkCss, linkIconCss } from './css';
import ProvinceTooltip, { SelectedProvince } from './ProvinceTooltip';
import { ApiDatum, Covid19Data, Province } from './types';

const MAPBOX_ACCESS_TOKEN = process.env.GATSBY_MAPBOX_ACCESS_TOKEN;

const INITIAL_VIEW_STATE = {
  longitude: -97,
  latitude: 39,
  zoom: 3.8,
};

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

export default (): JSX.Element | null => {
  const [countryQuery, setCountryQuery] = useQueryParam('country', StringParam);
  const [country, setCountry] = useState<string>(countryQuery || 'us');
  const [covid19Data, dispatchCovid19Data] = useReducer(covid19DataReducer, {});
  const [
    selectedProvince,
    setSelectedProvince,
  ] = useState<SelectedProvince | null>(null);

  const countrySelectUid = useUID();
  const confirmedLayerUid = useUID();
  const deathsLayerUid = useUID();

  useEffect(() => {
    if (covid19Data[country]) {
      // already fetched data
      return;
    }

    STATUSES.forEach(status => {
      fetch(
        `https://api.covid19api.com/dayone/country/${country}/status/${status}`,
      )
        .then(res => res.json())
        .then(data => {
          if (!data) {
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

  const confirmedLayer = useMemo(
    () =>
      !covid19Data[country]
        ? null
        : new ScatterplotLayer({
            id: confirmedLayerUid,
            data: Object.keys(covid19Data[country])
              .map<Province>(k => covid19Data[country][k])
              .filter(province => province.maxDates.confirmed),
            pickable: true,
            opacity: 0.8,
            filled: true,
            radiusScale: 2000,
            radiusMinPixels: 4,
            radiusMaxPixels: 100,
            getPosition: (d: Province) => d.coordinates,
            getRadius: (d: Province) =>
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              Math.sqrt(d.data[d.maxDates.confirmed!].confirmed!),
            getFillColor: (d: Province) => [0, 124, 254],
            onHover: ({
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
            },
          }),
    [covid19Data, country, confirmedLayerUid],
  );

  const deathsLayer = useMemo(
    () =>
      !covid19Data[country]
        ? null
        : new ScatterplotLayer({
            id: deathsLayerUid,
            data: Object.keys(covid19Data[country])
              .map<Province>(k => covid19Data[country][k])
              .filter(province => province.maxDates.deaths),
            pickable: true,
            opacity: 0.8,
            filled: true,
            radiusScale: 2000,
            radiusMinPixels: 2,
            radiusMaxPixels: 100,
            getPosition: (d: Province) => d.coordinates,
            getRadius: (d: Province) =>
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              Math.sqrt(d.data[d.maxDates.deaths!].deaths!),
            getFillColor: (d: Province) => [255, 79, 122],
            onHover: ({
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
            },
          }),
    [covid19Data, country, deathsLayerUid],
  );

  return (
    <>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller
        layers={[confirmedLayer, deathsLayer]}
      >
        <StaticMap
          mapboxApiAccessToken={MAPBOX_ACCESS_TOKEN}
          width="100%"
          height="100%"
        />
        {selectedProvince && (
          <ProvinceTooltip selectedProvince={selectedProvince} />
        )}
      </DeckGL>
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
            margin-top: 0;
          `}
        >
          COVID-19 Map
          <div
            css={css`
              float: right;
            `}
          >
            <a
              href="https://covid19api.com/"
              target="_blank"
              rel="noopener noreferrer"
              css={linkCss}
              title="data"
            >
              <img src={Logo} alt="covid19api logo" css={linkIconCss} />
            </a>
            <a
              href="https://github.com/leyanlo/covid19api"
              target="_blank"
              rel="noopener noreferrer"
              css={linkCss}
              title="code"
            >
              <img src={Octicon} alt="GitHub logo" css={linkIconCss} />
            </a>
          </div>
        </h1>
        <label htmlFor={countrySelectUid}>
          Select country:{' '}
          <select
            id={countrySelectUid}
            defaultValue={country}
            css={css`
              max-width: 128px;
            `}
            onChange={event => {
              setCountryQuery(event.target.value);
              setCountry(event.target.value);
            }}
          >
            {(Object.keys(COUNTRIES) as (keyof typeof COUNTRIES)[]).map(k => (
              <option value={k} key={k}>
                {COUNTRIES[k]}
              </option>
            ))}
          </select>
        </label>
      </section>
    </>
  );
};