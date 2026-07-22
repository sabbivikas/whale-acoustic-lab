# Coda Code validation

- Included EC1 rhythm examples: 7,268
- Leave-one-out nearest-family accuracy: 92.226% (6,703/7,268)
- Post-abstention coverage: 94.565% (6,873/7,268)
- Post-abstention accuracy among accepted examples: 92.594%
- Aligned dialogue rows used: 3,673/3,840
- Paper/release discrepancy: paper states 3,948 dialogue codas; the released CSV and both aligned annotation lists contain 3,840. The absent 108 are not reconstructed.
- Abstention: nearest rhythm MSE must be at or below the click-count-specific 95th percentile of correctly classified leave-one-out distances.
- Context roles are deterministic dataset-derived hypotheses, not translations, probabilities, identities, emotions, or intent labels.
