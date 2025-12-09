# Priority Watersheds for Wetland Conservation


## Priority Watershed Analysis Methodology

This analysis identifies priority watersheds for wetland conservation
based on a composite score that integrates multiple conservation
criteria. We use HydroBASINS Level 6 watersheds as our spatial units of
analysis.

### Data Sources

The analysis integrates the following global datasets:

1.  **Wetlands**: Global Lakes and Wetlands Database (GLWD) - provides
    wetland extent and type
2.  **Carbon Storage**: Vulnerable carbon data from Conservation
    International - represents irrecoverable carbon stocks
3.  **Protected Areas**: World Database on Protected Areas (WDPA) -
    identifies existing conservation coverage
4.  **Biodiversity Value**: Nature’s Contributions to People (NCP)
    scores - biodiversity and ecosystem service importance
5.  **Watersheds**: HydroBASINS Level 6 - watershed boundaries for
    analysis units

### Composite Score Calculation

Each watershed receives a **composite score** (0-1 scale) based on four
equally-weighted criteria:

#### 1. Wetland Area (25% weight)

- **Metric**: Total hectares of wetlands within the watershed
- **Normalization**: Scaled relative to the largest wetland area in the
  country
- **Rationale**: Larger wetland areas provide greater ecosystem services
  and habitat

#### 2. Vulnerable Carbon (25% weight)

- **Metric**: Total vulnerable carbon stocks (metric tons) in wetland
  areas
- **Normalization**: Scaled relative to the highest carbon stock in the
  country
- **Rationale**: Identifies wetlands whose loss would release
  significant greenhouse gases

#### 3. Protection Gap (25% weight)

- **Metric**: Fraction of wetland area NOT currently protected (1 -
  protected_fraction)
- **Range**: 0 (fully protected) to 1 (completely unprotected)
- **Rationale**: Prioritizes watersheds with low current protection
  status

#### 4. Biodiversity & Ecosystem Services (25% weight)

- **Metric**: Average Nature’s Contributions to People (NCP) score
- **Range**: 0 (low importance) to 1 (high importance)
- **Rationale**: Identifies areas critical for biodiversity and human
  well-being

### Formula

    composite_score = (
        (wetland_area / max_wetland_area) * 0.25 +
        (total_carbon / max_total_carbon) * 0.25 +
        (1 - protected_fraction) * 0.25 +
        avg_ncp_score * 0.25
    )

### Important Notes

- **GLWD Multiple Categories**: A single hexagon in GLWD can have
  multiple wetland type codes. We use `n_distinct(h8)` to avoid counting
  the same location multiple times.
- **H3 Hexagons**: All data is indexed using H3 hexagons at resolution
  8, where each hex = 73.73 hectares
- **Country-Specific Normalization**: Scores are normalized within each
  country to identify relative priorities

## Setup

``` r
library(duckdbfs)
library(dplyr)
library(dbplyr)
library(ggplot2)
library(tidyr)

# Configure DuckDB connection to S3
duckdb_secrets(
    key = "",
    secret = "",
    endpoint = "minio.carlboettiger.info"
)
```

    [1] 1

``` r
# H3 hexagon area constant
hex_hectares <- 73.7327598

# Load datasets
countries <- open_dataset(
    "s3://public-overturemaps/hex/countries.parquet",
    recursive = FALSE
)
wetlands <- open_dataset("s3://public-wetlands/glwd/hex/**")
hydrobasins <- open_dataset("s3://public-hydrobasins/level_06/hexes/**")
carbon <- open_dataset("s3://public-carbon/hex/vulnerable-carbon/**")
wdpa <- open_dataset("s3://public-wdpa/hex/**")
ncp <- open_dataset("s3://public-ncp/hex/ncp_biod_nathab/**")

cat("✅ Datasets loaded successfully\n")
```

    ✅ Datasets loaded successfully

## Analysis Function

``` r
analyze_hydrobasins_for_country <- function(
    country_code,
    country_name,
    top_n = 3
) {
    cat("\n", paste(rep("=", 80), collapse = ""), "\n")
    cat("Analyzing:", country_name, "(", country_code, ")\n")
    cat(paste(rep("=", 80), collapse = ""), "\n\n")

    # Step 1: Get wetlands in basins for this country
    basin_wetlands <- countries |>
        filter(country == country_code) |>
        inner_join(
            wetlands,
            by = c("h8", "h0"),
            suffix = c("_country", "_wetland")
        ) |>
        filter(Z > 0) |>
        inner_join(hydrobasins, by = c("h8", "h0"), suffix = c("", "_basin")) |>
        select(basin_id = id_basin, PFAF_ID, UP_AREA, SUB_AREA, h8, h0)

    # Step 2: Calculate metrics for each basin
    basin_metrics <- basin_wetlands |>
        # Join with carbon data
        left_join(carbon, by = c("h8", "h0")) |>
        # Join with protected areas
        left_join(
            wdpa |> select(h8, h0, wdpa_present = OBJECTID),
            by = c("h8", "h0")
        ) |>
        # Join with NCP scores
        left_join(ncp, by = c("h8", "h0")) |>
        # Group by basin and calculate metrics
        group_by(basin_id, PFAF_ID, UP_AREA, SUB_AREA) |>
        summarise(
            # A. Wetland area
            wetland_hex_count = n_distinct(h8),
            # B. Total carbon
            total_carbon = round(coalesce(sum(carbon, na.rm = TRUE), 0), 2),
            # C. Protected fraction (count distinct protected hexes, not total WDPA rows)
            protected_fraction = round(
                n_distinct(h8[!is.na(wdpa_present)]) / n_distinct(h8),
                3
            ),
            # D. Average NCP score
            avg_ncp_score = round(mean(ncp, na.rm = TRUE), 3),
            .groups = "drop"
        ) |>
        # Calculate area from hex count (needs separate mutate for dbplyr)
        mutate(
            wetland_area_hectares = round(wetland_hex_count * hex_hectares, 2)
        )
    
    # Show the SQL query generated by dbplyr
    cat("\n=== Generated SQL Query ===\n")
    basin_metrics |> show_query()
    cat("\n")

    # Step 3: Calculate composite scores
    results <- basin_metrics |>
        mutate(
            # Normalize each metric (0-1 scale)
            norm_wetland_area = wetland_area_hectares /
                max(wetland_area_hectares, na.rm = TRUE),
            norm_carbon = total_carbon / max(total_carbon, na.rm = TRUE),
            # Protection gap (inverse of protected fraction)
            protection_gap = 1 - protected_fraction,
            # Composite score (equal weights)
            composite_score = round(
                (norm_wetland_area *
                    0.25 +
                    norm_carbon * 0.25 +
                    protection_gap * 0.25 +
                    coalesce(avg_ncp_score, 0) * 0.25),
                3
            )
        ) |>
        # Select final columns
        select(
            basin_id,
            PFAF_ID,
            upstream_area_km2 = UP_AREA,
            basin_area_km2 = SUB_AREA,
            wetland_hex_count,
            wetland_area_hectares,
            total_carbon,
            protected_fraction,
            avg_ncp_score,
            composite_score
        ) |>
        filter(wetland_hex_count > 0) |>
        arrange(desc(composite_score)) |>
        head(top_n) |>
        collect()

    if (nrow(results) > 0) {
        results <- results |>
            mutate(
                country = country_name,
                country_code = country_code
            )

        cat("Top", top_n, "Priority Hydrobasins in", country_name, ":\n\n")
        print(
            results |>
                select(
                    basin_id,
                    PFAF_ID,
                    wetland_area_hectares,
                    total_carbon,
                    protected_fraction,
                    avg_ncp_score,
                    composite_score
                )
        )
    } else {
        cat("No wetland data found for", country_name, "\n")
        results <- tibble(
            country = country_name,
            country_code = country_code
        )
    }

    return(results)
}
```

## North America: United States, Canada, and Mexico

``` r
us_results <- analyze_hydrobasins_for_country('US', 'United States', top_n = 3)
```


     ================================================================================ 
    Analyzing: United States ( US )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'US')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in United States :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m7[24m060[4m4[24m[4m6[24m[4m8[24m870  [4m7[24m[4m4[24m[4m2[24m954              3[4m8[24m[4m4[24m[4m2[24m509.     27[4m8[24m[4m4[24m[4m8[24m346              0.093
    [90m2[39m [4m7[24m060[4m0[24m[4m4[24m[4m4[24m360  [4m7[24m[4m3[24m[4m2[24m573               [4m9[24m[4m8[24m[4m8[24m240.    104[4m7[24m[4m0[24m[4m2[24m831              0.49 
    [90m3[39m [4m7[24m060[4m0[24m[4m4[24m[4m3[24m860  [4m7[24m[4m3[24m[4m2[24m560              2[4m0[24m[4m7[24m[4m3[24m734.     22[4m0[24m[4m6[24m[4m2[24m072              0.06 
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
canada_results <- analyze_hydrobasins_for_country('CA', 'Canada', top_n = 3)
```


     ================================================================================ 
    Analyzing: Canada ( CA )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'CA')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Canada :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m7[24m060[4m0[24m[4m2[24m[4m2[24m280  [4m7[24m[4m1[24m[4m3[24m300              2[4m5[24m[4m1[24m[4m3[24m918.    107[4m2[24m[4m7[24m[4m3[24m425              0.129
    [90m2[39m [4m7[24m060[4m2[24m[4m7[24m[4m6[24m840  [4m7[24m[4m1[24m[4m2[24m242              4[4m6[24m[4m4[24m[4m5[24m533.     77[4m8[24m[4m4[24m[4m0[24m679              0.055
    [90m3[39m [4m7[24m060[4m0[24m[4m2[24m[4m3[24m960  [4m7[24m[4m1[24m[4m3[24m540              1[4m5[24m[4m8[24m[4m9[24m531.     70[4m1[24m[4m6[24m[4m5[24m077              0    
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
mexico_results <- analyze_hydrobasins_for_country('MX', 'Mexico', top_n = 3)
```


     ================================================================================ 
    Analyzing: Mexico ( MX )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'MX')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Mexico :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m7[24m060[4m0[24m[4m5[24m[4m1[24m220  [4m7[24m[4m5[24m[4m3[24m715              4[4m1[24m[4m6[24m[4m9[24m440.     69[4m7[24m[4m9[24m[4m8[24m685              0.278
    [90m2[39m [4m7[24m060[4m0[24m[4m7[24m[4m5[24m070  [4m7[24m[4m5[24m[4m3[24m710              1[4m4[24m[4m7[24m[4m6[24m646.     14[4m6[24m[4m2[24m[4m6[24m168              0.044
    [90m3[39m [4m7[24m060[4m0[24m[4m0[24m[4m5[24m740  [4m7[24m[4m7[24m[4m1[24m303                [4m1[24m[4m5[24m926.       [4m1[24m[4m4[24m[4m2[24m093              0.009
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

## Asia: China, South Korea, and Thailand

``` r
china_results <- analyze_hydrobasins_for_country('CN', 'China', top_n = 3)
```


     ================================================================================ 
    Analyzing: China ( CN )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'CN')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in China :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m4[24m060[4m1[24m[4m5[24m[4m4[24m710  [4m4[24m[4m2[24m[4m2[24m499              3[4m2[24m[4m6[24m[4m6[24m214.     24[4m4[24m[4m1[24m[4m0[24m238              0.081
    [90m2[39m [4m4[24m060[4m2[24m[4m1[24m[4m3[24m920  [4m4[24m[4m2[24m[4m2[24m416              2[4m1[24m[4m3[24m[4m4[24m563.     17[4m9[24m[4m8[24m[4m4[24m046              0.007
    [90m3[39m [4m4[24m060[4m7[24m[4m8[24m[4m0[24m120  [4m4[24m[4m3[24m[4m4[24m962              1[4m8[24m[4m7[24m[4m5[24m835.     11[4m3[24m[4m6[24m[4m1[24m170              0.108
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
korea_results <- analyze_hydrobasins_for_country('KR', 'South Korea', top_n = 3)
```


     ================================================================================ 
    Analyzing: South Korea ( KR )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'KR')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in South Korea :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m4[24m060[4m0[24m[4m0[24m[4m5[24m050  [4m4[24m[4m2[24m[4m4[24m200              1[4m4[24m[4m3[24m[4m2[24m185.      4[4m3[24m[4m7[24m[4m5[24m953              0.28 
    [90m2[39m [4m4[24m060[4m0[24m[4m0[24m[4m3[24m940  [4m4[24m[4m2[24m[4m4[24m102              1[4m4[24m[4m4[24m[4m3[24m319.      2[4m1[24m[4m9[24m[4m9[24m144              0.088
    [90m3[39m [4m4[24m060[4m0[24m[4m0[24m[4m4[24m690  [4m4[24m[4m2[24m[4m4[24m109              1[4m0[24m[4m5[24m[4m9[24m835.       [4m6[24m[4m7[24m[4m3[24m158              0.035
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
thailand_results <- analyze_hydrobasins_for_country('TH', 'Thailand', top_n = 3)
```


     ================================================================================ 
    Analyzing: Thailand ( TH )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'TH')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Thailand :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m4[24m060[4m0[24m[4m1[24m[4m9[24m420  [4m4[24m[4m4[24m[4m4[24m037              1[4m3[24m[4m6[24m[4m0[24m296.      8[4m2[24m[4m6[24m[4m6[24m017              0.133
    [90m2[39m [4m4[24m060[4m0[24m[4m2[24m[4m1[24m590  [4m4[24m[4m4[24m[4m4[24m077               [4m6[24m[4m8[24m[4m3[24m945.     11[4m7[24m[4m5[24m[4m4[24m086              0.206
    [90m3[39m [4m4[24m060[4m0[24m[4m1[24m[4m8[24m230  [4m4[24m[4m4[24m[4m3[24m040              1[4m4[24m[4m9[24m[4m4[24m342.      3[4m5[24m[4m2[24m[4m5[24m396              0.087
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

## Europe: United Kingdom, France, and Spain

``` r
uk_results <- analyze_hydrobasins_for_country('GB', 'United Kingdom', top_n = 3)
```


     ================================================================================ 
    Analyzing: United Kingdom ( GB )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'GB')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in United Kingdom :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m2[24m060[4m0[24m[4m5[24m[4m1[24m160  [4m2[24m[4m3[24m[4m3[24m023              3[4m7[24m[4m3[24m[4m6[24m113.     54[4m9[24m[4m5[24m[4m5[24m700              0.384
    [90m2[39m [4m2[24m060[4m0[24m[4m5[24m[4m0[24m790  [4m2[24m[4m3[24m[4m3[24m021              1[4m0[24m[4m1[24m[4m0[24m360.     21[4m3[24m[4m6[24m[4m6[24m396              0.123
    [90m3[39m [4m2[24m060[4m0[24m[4m4[24m[4m9[24m690  [4m2[24m[4m3[24m[4m3[24m017              1[4m3[24m[4m1[24m[4m1[24m337.     28[4m4[24m[4m5[24m[4m1[24m190              0.371
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
france_results <- analyze_hydrobasins_for_country('FR', 'France', top_n = 3)
```


     ================================================================================ 
    Analyzing: France ( FR )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'FR')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in France :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m2[24m060[4m0[24m[4m2[24m[4m1[24m230  [4m2[24m[4m3[24m[4m2[24m305               [4m9[24m[4m5[24m[4m9[24m632.      7[4m8[24m[4m1[24m[4m4[24m810              0.258
    [90m2[39m [4m2[24m060[4m5[24m[4m0[24m[4m2[24m920  [4m2[24m[4m3[24m[4m2[24m240               [4m7[24m[4m7[24m[4m8[24m765.      5[4m7[24m[4m2[24m[4m7[24m431              0.284
    [90m3[39m [4m2[24m060[4m5[24m[4m3[24m[4m6[24m370  [4m2[24m[4m1[24m[4m6[24m026               [4m6[24m[4m8[24m[4m2[24m544.      3[4m9[24m[4m8[24m[4m5[24m500              0.365
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
spain_results <- analyze_hydrobasins_for_country('ES', 'Spain', top_n = 3)
```


     ================================================================================ 
    Analyzing: Spain ( ES )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'ES')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Spain :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m2[24m060[4m0[24m[4m1[24m[4m8[24m360  [4m2[24m[4m3[24m[4m1[24m201               [4m8[24m[4m3[24m[4m1[24m779.      6[4m3[24m[4m0[24m[4m4[24m305              0.223
    [90m2[39m [4m2[24m060[4m6[24m[4m1[24m[4m5[24m620  [4m2[24m[4m1[24m[4m6[24m042               [4m5[24m[4m8[24m[4m1[24m751.      5[4m4[24m[4m6[24m[4m6[24m492              0.312
    [90m3[39m [4m2[24m060[4m5[24m[4m9[24m[4m8[24m470  [4m2[24m[4m1[24m[4m6[24m049               [4m4[24m[4m6[24m[4m7[24m761.      3[4m2[24m[4m9[24m[4m4[24m130              0.282
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

## South America: Brazil and Chile

``` r
brazil_results <- analyze_hydrobasins_for_country('BR', 'Brazil', top_n = 3)
```


     ================================================================================ 
    Analyzing: Brazil ( BR )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'BR')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Brazil :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m6[24m060[4m2[24m[4m9[24m[4m4[24m360  [4m6[24m[4m2[24m[4m2[24m921              4[4m9[24m[4m2[24m[4m7[24m192.    142[4m5[24m[4m7[24m[4m2[24m413              0.571
    [90m2[39m [4m6[24m060[4m2[24m[4m6[24m[4m9[24m510  [4m6[24m[4m2[24m[4m2[24m972              4[4m9[24m[4m1[24m[4m1[24m339.    148[4m6[24m[4m0[24m[4m1[24m298              0.608
    [90m3[39m [4m6[24m060[4m2[24m[4m8[24m[4m7[24m830  [4m6[24m[4m2[24m[4m2[24m941              3[4m7[24m[4m2[24m[4m4[24m537.    181[4m3[24m[4m3[24m[4m2[24m932              0.615
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

``` r
chile_results <- analyze_hydrobasins_for_country('CL', 'Chile', top_n = 3)
```


     ================================================================================ 
    Analyzing: Chile ( CL )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'CL')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Chile :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m6[24m060[4m0[24m[4m3[24m[4m6[24m450  [4m6[24m[4m6[24m[4m1[24m002              2[4m5[24m[4m0[24m[4m8[24m167.     50[4m3[24m[4m0[24m[4m5[24m952              0.289
    [90m2[39m [4m6[24m060[4m0[24m[4m3[24m[4m8[24m660  [4m6[24m[4m6[24m[4m1[24m100              1[4m7[24m[4m2[24m[4m5[24m936.     63[4m9[24m[4m3[24m[4m3[24m206              0.901
    [90m3[39m [4m6[24m060[4m0[24m[4m2[24m[4m5[24m140  [4m6[24m[4m6[24m[4m1[24m700              1[4m2[24m[4m8[24m[4m1[24m033.     29[4m2[24m[4m8[24m[4m9[24m888              0.357
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

## Australia

``` r
australia_results <- analyze_hydrobasins_for_country(
    'AU',
    'Australia',
    top_n = 3
)
```


     ================================================================================ 
    Analyzing: Australia ( AU )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'AU')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in Australia :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m5[24m060[4m0[24m[4m7[24m[4m7[24m790  [4m5[24m[4m6[24m[4m9[24m001              2[4m5[24m[4m1[24m[4m0[24m379.     95[4m8[24m[4m3[24m[4m5[24m397              0.51 
    [90m2[39m [4m5[24m060[4m4[24m[4m5[24m[4m6[24m070  [4m5[24m[4m6[24m[4m8[24m610               [4m6[24m[4m6[24m[4m5[24m807.      2[4m5[24m[4m3[24m[4m0[24m883              0.02 
    [90m3[39m [4m5[24m060[4m0[24m[4m4[24m[4m9[24m720  [4m5[24m[4m6[24m[4m2[24m995              1[4m5[24m[4m1[24m[4m1[24m522.     20[4m5[24m[4m2[24m[4m1[24m613              0.347
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

## India

``` r
india_results <- analyze_hydrobasins_for_country('IN', 'India', top_n = 3)
```


     ================================================================================ 
    Analyzing: India ( IN )
    ================================================================================ 


    === Generated SQL Query ===
    <SQL>
    [34mSELECT[39m
      q01.*,
      ROUND_EVEN(wetland_hex_count * 73.7327598, CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mwetland_area_hectares
    [34mFROM[39m (
      [34mSELECT[39m
        basin_id,
        PFAF_ID,
        UP_AREA,
        SUB_AREA,
        COUNT(DISTINCT row(h8))[34m AS [39mwetland_hex_count,
        ROUND_EVEN(COALESCE(SUM(carbon), 0.0), CAST(ROUND(2.0, 0) AS INTEGER))[34m AS [39mtotal_carbon,
        ROUND_EVEN(COUNT(DISTINCT row(CASE WHEN (NOT((wdpa_present IS NULL))) THEN (h8) END)) / COUNT(DISTINCT row(h8)), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mprotected_fraction,
        ROUND_EVEN(AVG(ncp), CAST(ROUND(3.0, 0) AS INTEGER))[34m AS [39mavg_ncp_score
      [34mFROM[39m (
        [34mSELECT[39m
          odzmjzconepafhq.id[34m AS [39mbasin_id,
          PFAF_ID,
          UP_AREA,
          SUB_AREA,
          "...1".h8[34m AS [39mh8,
          "...1".h0[34m AS [39mh0,
          carbon,
          h7,
          h6,
          h5,
          h4,
          h3,
          OBJECTID[34m AS [39mwdpa_present,
          ncp
        [34mFROM[39m (
          [34mSELECT[39m q01.*
          [34mFROM[39m (
            [34mSELECT[39m LHS.*, Z
            [34mFROM[39m (
              [34mSELECT[39m gfuprlmnvnlzvcv.*
              [34mFROM[39m gfuprlmnvnlzvcv
              [34mWHERE[39m (country = 'IN')
            ) LHS
            [34mINNER JOIN[39m sbjhidctmyvlauh
              [34mON[39m (LHS.h8 = sbjhidctmyvlauh.h8[34m AND[39m LHS.h0 = sbjhidctmyvlauh.h0)
          ) q01
          [34mWHERE[39m (Z > 0.0)
        ) "...1"
        [34mINNER JOIN[39m odzmjzconepafhq
          [34mON[39m ("...1".h8 = odzmjzconepafhq.h8[34m AND[39m "...1".h0 = odzmjzconepafhq.h0)
        [34mLEFT JOIN[39m vfbflingwdzntep
          [34mON[39m ("...1".h8 = vfbflingwdzntep.h8[34m AND[39m "...1".h0 = vfbflingwdzntep.h0)
        [34mLEFT JOIN[39m hdbmbwmuqjealps
          [34mON[39m ("...1".h8 = hdbmbwmuqjealps.h8[34m AND[39m "...1".h0 = hdbmbwmuqjealps.h0)
        [34mLEFT JOIN[39m sxxaurehwdhfuha
          [34mON[39m ("...1".h8 = sxxaurehwdhfuha.h8[34m AND[39m "...1".h0 = sxxaurehwdhfuha.h0)
      ) q01
      [34mGROUP BY[39m basin_id, PFAF_ID, UP_AREA, SUB_AREA
    ) q01

    Top 3 Priority Hydrobasins in India :

    [90m# A tibble: 3 × 7[39m
        basin_id PFAF_ID wetland_area_hectares total_carbon protected_fraction
           [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m              [3m[90m<dbl>[39m[23m
    [90m1[39m [4m4[24m060[4m8[24m[4m3[24m[4m8[24m850  [4m4[24m[4m5[24m[4m2[24m910              1[4m0[24m[4m3[24m[4m2[24m627.     16[4m1[24m[4m7[24m[4m1[24m226                  0
    [90m2[39m [4m4[24m060[4m0[24m[4m4[24m[4m8[24m470  [4m4[24m[4m4[24m[4m6[24m000               [4m5[24m[4m3[24m[4m4[24m784.     14[4m4[24m[4m5[24m[4m8[24m760                  0
    [90m3[39m [4m4[24m060[4m8[24m[4m6[24m[4m5[24m930  [4m4[24m[4m5[24m[4m2[24m700              1[4m6[24m[4m0[24m[4m1[24m770.      8[4m4[24m[4m5[24m[4m2[24m995                  0
    [90m# ℹ 2 more variables: avg_ncp_score <dbl>, composite_score <dbl>[39m

## Summary: Combined Results

``` r
# Combine all results
all_results <- bind_rows(
    us_results,
    canada_results,
    mexico_results,
    china_results,
    korea_results,
    thailand_results,
    uk_results,
    france_results,
    spain_results,
    brazil_results,
    chile_results,
    australia_results,
    india_results
)

cat("\n", paste(rep("=", 80), collapse = ""), "\n")
```


     ================================================================================ 

``` r
cat("SUMMARY: Top Priority Hydrobasins Across All Countries\n")
```

    SUMMARY: Top Priority Hydrobasins Across All Countries

``` r
cat(paste(rep("=", 80), collapse = ""), "\n\n")
```

    ================================================================================ 

``` r
print(
    all_results |>
        select(
            country,
            basin_id,
            PFAF_ID,
            wetland_area_hectares,
            total_carbon,
            protected_fraction,
            avg_ncp_score,
            composite_score
        )
)
```

    [90m# A tibble: 39 × 8[39m
       country         basin_id PFAF_ID wetland_area_hectares total_carbon
       [3m[90m<chr>[39m[23m              [3m[90m<dbl>[39m[23m   [3m[90m<int>[39m[23m                 [3m[90m<dbl>[39m[23m        [3m[90m<dbl>[39m[23m
    [90m 1[39m United States [4m7[24m060[4m4[24m[4m6[24m[4m8[24m870  [4m7[24m[4m4[24m[4m2[24m954              3[4m8[24m[4m4[24m[4m2[24m509.     27[4m8[24m[4m4[24m[4m8[24m346
    [90m 2[39m United States [4m7[24m060[4m0[24m[4m4[24m[4m4[24m360  [4m7[24m[4m3[24m[4m2[24m573               [4m9[24m[4m8[24m[4m8[24m240.    104[4m7[24m[4m0[24m[4m2[24m831
    [90m 3[39m United States [4m7[24m060[4m0[24m[4m4[24m[4m3[24m860  [4m7[24m[4m3[24m[4m2[24m560              2[4m0[24m[4m7[24m[4m3[24m734.     22[4m0[24m[4m6[24m[4m2[24m072
    [90m 4[39m Canada        [4m7[24m060[4m0[24m[4m2[24m[4m2[24m280  [4m7[24m[4m1[24m[4m3[24m300              2[4m5[24m[4m1[24m[4m3[24m918.    107[4m2[24m[4m7[24m[4m3[24m425
    [90m 5[39m Canada        [4m7[24m060[4m2[24m[4m7[24m[4m6[24m840  [4m7[24m[4m1[24m[4m2[24m242              4[4m6[24m[4m4[24m[4m5[24m533.     77[4m8[24m[4m4[24m[4m0[24m679
    [90m 6[39m Canada        [4m7[24m060[4m0[24m[4m2[24m[4m3[24m960  [4m7[24m[4m1[24m[4m3[24m540              1[4m5[24m[4m8[24m[4m9[24m531.     70[4m1[24m[4m6[24m[4m5[24m077
    [90m 7[39m Mexico        [4m7[24m060[4m0[24m[4m5[24m[4m1[24m220  [4m7[24m[4m5[24m[4m3[24m715              4[4m1[24m[4m6[24m[4m9[24m440.     69[4m7[24m[4m9[24m[4m8[24m685
    [90m 8[39m Mexico        [4m7[24m060[4m0[24m[4m7[24m[4m5[24m070  [4m7[24m[4m5[24m[4m3[24m710              1[4m4[24m[4m7[24m[4m6[24m646.     14[4m6[24m[4m2[24m[4m6[24m168
    [90m 9[39m Mexico        [4m7[24m060[4m0[24m[4m0[24m[4m5[24m740  [4m7[24m[4m7[24m[4m1[24m303                [4m1[24m[4m5[24m926.       [4m1[24m[4m4[24m[4m2[24m093
    [90m10[39m China         [4m4[24m060[4m1[24m[4m5[24m[4m4[24m710  [4m4[24m[4m2[24m[4m2[24m499              3[4m2[24m[4m6[24m[4m6[24m214.     24[4m4[24m[4m1[24m[4m0[24m238
    [90m# ℹ 29 more rows[39m
    [90m# ℹ 3 more variables: protected_fraction <dbl>, avg_ncp_score <dbl>,[39m
    [90m#   composite_score <dbl>[39m

``` r
# Save to CSV
write.csv(all_results, 'priority_hydrobasins_results_r.csv', row.names = FALSE)
cat("\nResults saved to: priority_hydrobasins_results_r.csv\n")
```


    Results saved to: priority_hydrobasins_results_r.csv

## Visualization: Comparative Analysis

``` r
# Reset graphics device to avoid API mismatch
if (dev.cur() > 1) dev.off()
```

    null device 
              1 

``` r
# Create comparison plots
library(patchwork)

# A. Wetland Area by Country
p1 <- all_results |>
    group_by(country) |>
    summarise(total_wetland = sum(wetland_area_hectares, na.rm = TRUE)) |>
    arrange(total_wetland) |>
    mutate(country = factor(country, levels = country)) |>
    ggplot(aes(x = country, y = total_wetland)) +
    geom_col(fill = "steelblue") +
    coord_flip() +
    labs(
        title = "A. Wetland Area in Top Hydrobasins by Country",
        x = NULL,
        y = "Total Wetland Area (hectares)"
    ) +
    theme_minimal() +
    theme(panel.grid.major.y = element_blank())

# B. Carbon Storage by Country
p2 <- all_results |>
    group_by(country) |>
    summarise(total_carbon = sum(total_carbon, na.rm = TRUE)) |>
    arrange(total_carbon) |>
    mutate(country = factor(country, levels = country)) |>
    ggplot(aes(x = country, y = total_carbon)) +
    geom_col(fill = "darkgreen") +
    coord_flip() +
    labs(
        title = "B. Carbon Storage in Top Hydrobasins by Country",
        x = NULL,
        y = "Total Vulnerable Carbon"
    ) +
    theme_minimal() +
    theme(panel.grid.major.y = element_blank())

# C. Protected Fraction by Country
p3 <- all_results |>
    group_by(country) |>
    summarise(avg_protected = mean(protected_fraction, na.rm = TRUE)) |>
    arrange(avg_protected) |>
    mutate(country = factor(country, levels = country)) |>
    ggplot(aes(x = country, y = avg_protected)) +
    geom_col(fill = "orange") +
    coord_flip() +
    scale_y_continuous(limits = c(0, 1)) +
    labs(
        title = "C. Protection Coverage in Top Hydrobasins by Country",
        x = NULL,
        y = "Average Protected Fraction"
    ) +
    theme_minimal() +
    theme(panel.grid.major.y = element_blank())

# D. NCP Score by Country
p4 <- all_results |>
    group_by(country) |>
    summarise(avg_ncp = mean(avg_ncp_score, na.rm = TRUE)) |>
    arrange(avg_ncp) |>
    mutate(country = factor(country, levels = country)) |>
    ggplot(aes(x = country, y = avg_ncp)) +
    geom_col(fill = "purple") +
    coord_flip() +
    scale_y_continuous(limits = c(0, 1)) +
    labs(
        title = "D. Nature Contributions in Top Hydrobasins by Country",
        x = NULL,
        y = "Average NCP Score"
    ) +
    theme_minimal() +
    theme(panel.grid.major.y = element_blank())

# Combine plots
(p1 | p2) / (p3 | p4)

ggsave(
    'priority_hydrobasins_comparison_r.png',
    width = 14,
    height = 10,
    dpi = 300
)
```

## Composite Score Distribution

``` r
# Reset graphics device
if (dev.cur() > 1) dev.off()
```

    null device 
              1 

``` r
all_results |>
    ggplot(aes(
        x = reorder(country, composite_score, FUN = median),
        y = composite_score
    )) +
    geom_boxplot(fill = "#66c2a5", alpha = 0.7) +
    geom_jitter(width = 0.2, alpha = 0.5, size = 2) +
    coord_flip() +
    labs(
        title = "Distribution of Composite Scores Across Countries",
        subtitle = "Top 3 Hydrobasins Each",
        x = NULL,
        y = "Composite Score"
    ) +
    theme_minimal() +
    theme(panel.grid.major.y = element_blank())

ggsave('composite_score_distribution_r.png', width = 12, height = 6, dpi = 300)
```

## Key Findings

### Methodology

For each country, we identified the top 3 Level 6 HydroBASINS based on a
composite score that equally weights four key metrics:

1.  **Wetland Area (25%)**: Total hectares of wetlands from GLWD
2.  **Carbon Storage (25%)**: Vulnerable carbon in wetlands
3.  **Protection Status (25%)**: Fraction of wetlands within WDPA
    protected areas
4.  **Nature’s Contributions (25%)**: Average NCP biodiversity score

### Interpretation

The composite score helps identify hydrobasins that balance multiple
conservation priorities: - High wetland area indicates ecological
significance - High carbon storage suggests climate mitigation
importance - Low protection fraction highlights conservation gaps - High
NCP scores indicate biodiversity value and ecosystem services

### Next Steps

The results can be used to: - Prioritize watersheds for conservation
investment - Identify protection gaps in high-value wetlands - Support
climate and biodiversity policy decisions - Guide restoration and
protection efforts
