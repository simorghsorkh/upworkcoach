import { configure } from '@testing-library/dom';

/**
 * Component tests (jsdom) run next to the integration suite, which keeps every core busy.
 * `findBy*` / `waitFor` default to 1 s, which a fetch → state → render round trip can exceed
 * under that load even though nothing is wrong. 5 s still fails fast on a real bug.
 */
configure({ asyncUtilTimeout: 5_000 });
