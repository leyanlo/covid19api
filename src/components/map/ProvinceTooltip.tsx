import { css } from '@emotion/react';
import React, { useMemo } from 'react';

import useWindowSize from '../../hooks/useWindowSize';
import { STATUSES, TOOLTIP_OFFSET } from './constants';
import { Province } from './types';

export type SelectedProvince = {
  province: Province;
  x: number;
  y: number;
  deltaX?: number;
  deltaY?: number;
};

const ProvinceTooltip = ({
  selectedProvince: { province, x, y, deltaX = 0, deltaY = 0 },
}: {
  selectedProvince: SelectedProvince;
}): JSX.Element | null => {
  const { width, height } = useWindowSize();

  const nextX = x + deltaX;
  const nextY = y + deltaY;

  const isRight = useMemo(() => !width || nextX < width / 2, [nextX, width]);
  const isBottom = useMemo(() => !height || nextY < height / 2, [
    nextY,
    height,
  ]);

  return (
    <section
      css={css`
        position: absolute;
        transform: translate(
            ${isRight ? nextX + TOOLTIP_OFFSET : nextX - TOOLTIP_OFFSET}px,
            ${isBottom ? nextY + TOOLTIP_OFFSET : nextY - TOOLTIP_OFFSET}px
          )
          translate(${isRight ? 0 : '-100%'}, ${isBottom ? 0 : '-100%'});
        background: #fffc;
        padding: 8px 16px;
      `}
    >
      <h1
        css={css`
          font-size: 16px;
          margin: 0 0 4px;
        `}
      >
        {province.name}
      </h1>
      <ul
        css={css`
          margin: 0;
          padding: 0;
          list-style: none;
          font-size: 14px;
        `}
      >
        {STATUSES.map(
          (status): JSX.Element => (
            <li key={status}>
              {(province.maxDates[status] &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                province.data[province.maxDates[status]!][status]) ||
                0}{' '}
              {status}
            </li>
          ),
        )}
      </ul>
    </section>
  );
};
export default ProvinceTooltip;
