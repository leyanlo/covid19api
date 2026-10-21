import { css } from '@emotion/react';

export const linkCss = css`
  width: 20px;
  height: 20px;
  display: inline-block;
  vertical-align: text-top;
  :not(:last-child) {
    margin-right: 8px;
  }
`;

export const linkIconCss = css`
  width: 100%;
  height: 100%;
  display: block;
`;
