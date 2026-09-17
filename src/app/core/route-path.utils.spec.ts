import { isRoutePath } from './route-path.utils';

describe('isRoutePath', () => {
  it('matches the route and its nested paths, ignoring query and fragment, without matching siblings', () => {
    expect(isRoutePath('/notebook', '/notebook')).toBe(true);
    expect(isRoutePath('/notebook/launch', '/notebook')).toBe(true);
    expect(isRoutePath('/notebook?session=1#top', '/notebook')).toBe(true);
    expect(isRoutePath('/experiments?experiment=7', '/notebook')).toBe(false);
    expect(isRoutePath('/notebookish', '/notebook')).toBe(false);
    expect(isRoutePath('/experiments-dashboard', '/experiments')).toBe(false);
    expect(isRoutePath('/experiments-dashboard', '/experiments-dashboard')).toBe(true);
  });
});
