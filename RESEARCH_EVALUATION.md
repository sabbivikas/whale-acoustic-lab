# Annotation Evaluation

Annotation Evaluation compares the immutable automatic detections returned by the analysis response with the current non-rejected annotations in the Research Mode review set. All matching and metrics run locally in the browser. No annotation is uploaded and no acoustic model is rerun.

The review set is **not automatically scientific ground truth**. It records current researcher judgments and may still contain omissions, timing uncertainty, or inconsistent decisions. Metrics describe agreement with that set under documented heuristics; they do not independently validate the detector.

## Click review set

- The automatic set contains every original automatic click estimate.
- The reviewed set contains current click annotations whose status is `accepted` or `uncertain`.
- Reviewed clicks marked `rejected` are excluded from evaluation.
- Uncertain clicks remain in the review set and retain their annotation status in research exports.

## Click matching algorithm

Clicks are sorted by onset time. An order-preserving dynamic program selects one-to-one automatic/reviewed pairs. It optimizes in this order:

1. maximize the number of pairs whose absolute timing difference is within the configured tolerance;
2. minimize total absolute timing error among alignments with the same match count;
3. use stable annotation IDs to resolve an otherwise exact tie deterministically.

One reviewed click cannot match multiple automatic clicks, and one automatic click cannot match multiple reviewed clicks.

The default tolerance is **10 milliseconds**. Researchers may select a value from **1–100 milliseconds**. The tolerance is inclusive: a pair whose absolute timing difference exactly equals the tolerance may match.

## Click metrics

| Metric | Definition |
| --- | --- |
| Automatic click count | Number of original automatic click estimates. |
| Reviewed click count | Number of non-rejected clicks in the current review set. |
| Matched clicks | Number of one-to-one pairs selected by the matching algorithm. |
| Unmatched automatic clicks | Automatic estimates not used in a pair. |
| Unmatched reviewed clicks | Reviewed annotations not used in a pair. |
| Precision | `matched / automatic`. `null` when there are no automatic clicks. |
| Recall | `matched / reviewed`. `null` when there are no reviewed clicks. |
| F1 score | Harmonic mean of precision and recall. `null` when undefined or both rates are zero. |
| Mean absolute timing error | Mean absolute onset difference across matched click pairs. |
| Median absolute timing error | Median absolute onset difference across matched click pairs. |
| Maximum timing error | Largest absolute onset difference among matched click pairs. |

## Coda review set and matching

- The automatic coda set contains every original probable coda region.
- The reviewed coda set contains current coda regions whose status is `accepted` or `uncertain`.
- Reviewed codas marked `rejected` are excluded.

For regions `A` and `B`, temporal intersection over union is:

```text
IoU = duration(intersection(A, B)) / duration(union(A, B))
```

Regions that do not overlap, or whose union has zero duration, have IoU `0`.

Coda matching uses an order-preserving one-to-one alignment. A pair is eligible when IoU is at least **0.50**. The algorithm first maximizes eligible pair count and then maximizes total IoU. The 0.50 threshold is an evaluation heuristic, not a scientifically validated boundary criterion.

## Coda metrics and candidate errors

| Metric | Definition |
| --- | --- |
| Automatic/reviewed coda count | Region counts in the two sets. |
| Matched codas | One-to-one pairs with IoU at least 0.50. |
| Unmatched automatic/reviewed codas | Regions not included in a matched pair. |
| Boundary start error | Mean absolute difference between matched start boundaries. |
| Boundary end error | Mean absolute difference between matched end boundaries. |
| Mean IoU | Mean temporal IoU across matched coda pairs. |
| Possible split error | One automatic region has positive-duration overlap with more than one reviewed region. |
| Possible merge error | More than one automatic region has positive-duration overlap with one reviewed region. |

Split and merge indicators are candidates for inspection. They are not assertions that either annotation set is correct.

## Visual comparison

The aligned visualization uses separate rows for automatic and reviewed clicks, and separate rows for automatic and reviewed coda regions. Matched clicks are connected. Unmatched automatic and unmatched reviewed annotations use distinct colors. The chart is descriptive; the numeric exports remain the authoritative evaluation record.

## Evaluation exports

Files use the first 12 SHA-256 characters:

- `<hash12>_annotation-evaluation.json`
- `<hash12>_annotation-evaluation.csv`

The JSON contains the audio hash, tolerance, metrics, every match and timing/boundary error, all unmatched annotations, algorithm version, timestamp, and limitations.

The CSV contains one row per matched or unmatched click or coda record. Its fields identify both sides of a match, timing boundaries, click timing error, coda boundary errors, IoU, tolerance, and algorithm version. Numeric values retain their stored precision.

## Scientific limitations

- Automatic annotations can contain false detections, missed detections, and timing error.
- Researcher review can also contain mistakes and uncertainty.
- Results change when the click tolerance changes.
- Coda results depend on the 0.50 IoU heuristic and overlap-based split/merge candidate rules.
- Agreement metrics do not demonstrate semantic understanding, biological interpretation, generalization, or scientific validation.
- A review set should be called verified ground truth only under a separate, explicit research protocol that establishes that status. Research Mode does not make that designation automatically.
