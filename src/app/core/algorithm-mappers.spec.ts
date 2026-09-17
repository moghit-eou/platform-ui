import { getOutputSchema } from './algorithm-mappers';
describe('algorithm mappers', () => {
  it('provides output schemas for new Exaflow algorithms', () => {
    ['lmm', 'glmm_binary', 'glmm_ordinal', 'chi_squared', 'fisher_exact', 'outlier_report', 'quartiles', 'binned_mann_whitney_u_test'].forEach((name) => {
      const schema = getOutputSchema(name);
      expect(schema).toBeTruthy();
      expect(schema?.length).toBeGreaterThan(0);
    });
  });
});
