/**
 * Cascading geographic picker: Country → State → City → Sub-area.
 *
 * Each level is a themed Combobox that unlocks only after the parent is
 * chosen, with "Other (type custom value)" pinned to the top so a
 * freelancer can enter places that aren't in the bundled dataset.
 *
 * Data source
 * -----------
 * Countries / states / cities come from ``country-state-city`` (bundled
 * locally — no network call). Sub-areas have no comprehensive global
 * dataset, so that level falls back to free-text entry plus any
 * suggestions the caller passes in (typically the freelancer's own
 * SearchHistory for the selected city).
 *
 * Cascade reset rules
 * -------------------
 * Picking a new country clears region / city / sub-area.
 * Picking a new state clears city / sub-area.
 * Picking a new city clears sub-area.
 * Picking "Other" at any level clears every downstream value AND locks
 * the next level to free-text only — there's no canonical state list
 * for an unrecognized country, etc.
 *
 * Two-way data flow
 * -----------------
 * - When the bound ``country_code`` matches a known ISO alpha-2, the
 *   country combobox shows the matching name; otherwise free-text mode
 *   is auto-selected (handled by the underlying Combobox).
 * - Picking a country from the dropdown sets BOTH ``country`` (name)
 *   and ``country_code`` (ISO alpha-2). Custom country entry sets the
 *   name only and clears the code so the backend doesn't reject a
 *   stale code paired with an unrelated country name.
 */
import { useMemo } from 'react';

import { Country, State, City } from 'country-state-city';

import Combobox, { type ComboboxOption } from './Combobox';

export interface CascadingLocationValue {
  country: string;
  country_code: string;
  region: string;
  city: string;
  sub_area: string;
}

interface CascadingLocationPickerProps {
  value: CascadingLocationValue;
  onChange: (patch: Partial<CascadingLocationValue>) => void;
  /** Optional sub-area suggestions (e.g., from search history). */
  subAreaSuggestions?: string[];
  /** Mark the city level as required in its label. Other levels stay optional. */
  cityRequired?: boolean;
  className?: string;
}

const COUNTRY_OPTIONS: ComboboxOption[] = Country.getAllCountries()
  .map((c) => ({
    value: c.isoCode,
    label: `${c.flag ? `${c.flag}  ` : ''}${c.name}`,
    hint: c.isoCode,
  }))
  // The library is already alphabetical, but defensively sort by name in
  // case a future data update reorders entries.
  .sort((a, b) => a.label.localeCompare(b.label));

export default function CascadingLocationPicker({
  value,
  onChange,
  subAreaSuggestions = [],
  cityRequired = true,
  className,
}: CascadingLocationPickerProps) {
  // Resolve the saved value back to the library's ISO code when possible.
  // Saved data stores the country *name* and a 2-letter code — the code
  // is the source of truth for matching the dropdown row.
  const knownCountryByCode = useMemo(
    () => new Map(Country.getAllCountries().map((c) => [c.isoCode, c])),
    [],
  );
  const knownCountryByName = useMemo(
    () =>
      new Map(
        Country.getAllCountries().map((c) => [c.name.toLowerCase(), c]),
      ),
    [],
  );

  const matchedCountry =
    (value.country_code && knownCountryByCode.get(value.country_code.toUpperCase())) ||
    (value.country &&
      knownCountryByName.get(value.country.trim().toLowerCase())) ||
    null;

  // Country combobox is keyed by ISO code so picks unambiguously map
  // back to the canonical country.
  const countryValue = matchedCountry?.isoCode ?? value.country ?? '';

  const states = useMemo(
    () =>
      matchedCountry ? State.getStatesOfCountry(matchedCountry.isoCode) : [],
    [matchedCountry],
  );

  const stateOptions: ComboboxOption[] = useMemo(
    () =>
      states
        .map((s) => ({ value: s.isoCode, label: s.name, hint: s.isoCode }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [states],
  );

  const matchedState = useMemo(() => {
    if (!matchedCountry || !value.region) return null;
    const lower = value.region.trim().toLowerCase();
    return (
      states.find((s) => s.name.toLowerCase() === lower) ||
      states.find((s) => s.isoCode.toLowerCase() === lower) ||
      null
    );
  }, [matchedCountry, states, value.region]);

  const stateValue = matchedState?.isoCode ?? value.region ?? '';

  const cities = useMemo(() => {
    if (!matchedCountry || !matchedState) return [];
    return City.getCitiesOfState(matchedCountry.isoCode, matchedState.isoCode);
  }, [matchedCountry, matchedState]);

  // City names can repeat across states — disambiguate by lowercased name
  // for matching, but the dropdown shows the plain name.
  const cityOptions: ComboboxOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: ComboboxOption[] = [];
    for (const c of cities) {
      const key = c.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ value: c.name, label: c.name });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [cities]);

  const cityValue = value.city ?? '';
  const cityKnown = useMemo(
    () => cityOptions.some((o) => o.value.toLowerCase() === cityValue.toLowerCase()),
    [cityOptions, cityValue],
  );

  // Sub-area dataset doesn't exist in the library; surface caller-provided
  // suggestions (typically the freelancer's own recent searches in this
  // city) so re-targeting a familiar neighborhood is one click.
  const subAreaOptions: ComboboxOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: ComboboxOption[] = [];
    for (const raw of subAreaSuggestions) {
      const v = (raw || '').trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ value: v, label: v });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [subAreaSuggestions]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCountryChange = (newValue: string) => {
    // The Combobox emits either an ISO code (when picked from the list)
    // or a free-text country name (when "Other" is used).
    const known = knownCountryByCode.get(newValue.toUpperCase());
    if (known) {
      onChange({
        country: known.name,
        country_code: known.isoCode,
        region: '',
        city: '',
        sub_area: '',
      });
    } else {
      onChange({
        country: newValue,
        country_code: '',
        region: '',
        city: '',
        sub_area: '',
      });
    }
  };

  const handleStateChange = (newValue: string) => {
    if (!matchedCountry) {
      // Defensive: shouldn't be reachable because the picker is disabled,
      // but if it does fire, treat as free-text.
      onChange({ region: newValue, city: '', sub_area: '' });
      return;
    }
    const known = states.find(
      (s) => s.isoCode.toUpperCase() === newValue.toUpperCase(),
    );
    onChange({
      region: known ? known.name : newValue,
      city: '',
      sub_area: '',
    });
  };

  const handleCityChange = (newValue: string) => {
    onChange({ city: newValue, sub_area: '' });
  };

  const handleSubAreaChange = (newValue: string) => {
    onChange({ sub_area: newValue });
  };

  // ── Lock messaging ────────────────────────────────────────────────────────

  const stateDisabled = !value.country && !matchedCountry;
  const stateDisabledHint = 'Pick a country first';

  // City dropdown is locked until a state is chosen. Free-text countries
  // (no library match) lock state too — so city stays locked unless they
  // type a state via "Other".
  const cityDisabled = !value.region && !matchedState;
  const cityDisabledHint = matchedCountry
    ? 'Pick a state / region first'
    : 'Pick a country and state first';

  const subAreaDisabled = !value.city;
  const subAreaDisabledHint = 'Pick a city first';

  // If the country is custom (no library match) we have no canonical
  // state list — surface this hint inside the empty-options message so
  // the user knows to use "Other".
  const stateEmptyMessage = matchedCountry
    ? 'No states found for this country — use "Other" to type one.'
    : 'States are only listed for known countries — use "Other" to type one.';

  const cityEmptyMessage = matchedState
    ? 'No cities listed for this state — use "Other" to type one.'
    : 'Cities are only listed for known states — use "Other" to type one.';

  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Combobox
          label="Country"
          value={countryValue}
          onChange={handleCountryChange}
          options={COUNTRY_OPTIONS}
          placeholder="Select country…"
          searchPlaceholder="Search countries…"
          otherLabel="Other (type country name)"
        />

        <Combobox
          label="State / Region"
          value={stateValue}
          onChange={handleStateChange}
          options={stateOptions}
          placeholder="Select state…"
          searchPlaceholder="Search states…"
          otherLabel="Other (type state / region)"
          disabled={stateDisabled}
          disabledHint={stateDisabledHint}
          emptyMessage={stateEmptyMessage}
        />

        <Combobox
          label="City"
          required={cityRequired}
          value={cityValue}
          onChange={handleCityChange}
          options={cityOptions}
          placeholder="Select city…"
          searchPlaceholder="Search cities…"
          otherLabel="Other (type city name)"
          disabled={cityDisabled}
          disabledHint={cityDisabledHint}
          emptyMessage={cityEmptyMessage}
        />

        <Combobox
          label="Sub-area / Suburb"
          value={value.sub_area || ''}
          onChange={handleSubAreaChange}
          options={subAreaOptions}
          placeholder={
            cityKnown
              ? 'Select or type a neighborhood…'
              : 'Type a neighborhood (optional)…'
          }
          searchPlaceholder="Search sub-areas…"
          otherLabel="Other (type neighborhood)"
          disabled={subAreaDisabled}
          disabledHint={subAreaDisabledHint}
          emptyMessage={
            subAreaOptions.length === 0
              ? 'No saved sub-areas yet — pick "Other" to type one.'
              : undefined
          }
        />
      </div>
    </div>
  );
}
