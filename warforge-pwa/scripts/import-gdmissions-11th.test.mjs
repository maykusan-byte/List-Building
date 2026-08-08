import { describe, expect, it } from 'vitest';
import { extractRscPayload, parseSitemap } from './import-gdmissions-11th.mjs';

describe('GDM 11th importer', () => {
  it('keeps the serialized server payload without evaluating it', () => {
    const payload = 'd:{"primary":{"name":"Mission"}}';
    const html = `<script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;

    expect(extractRscPayload(html)).toBe(payload);
  });

  it('selects only the V11 urls declared in the sitemap', () => {
    const sitemap = '<urlset><url><loc>https://gdmissions.app/11th/primary-missions/a</loc></url><url><loc>https://gdmissions.app/primary-missions/a</loc></url><url><loc>https://gdmissions.app/11th/tracker/play</loc></url></urlset>';

    expect(parseSitemap(sitemap)).toEqual(['https://gdmissions.app/11th/primary-missions/a']);
  });
});
