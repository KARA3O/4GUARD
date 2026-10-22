// Single source of truth for what 4Guard offers.
// Imported by the website (booking form, services page) AND by the Worker API (validation),
// so the two can never disagree. Edit this file to add or remove a service.
//
// NOTE FOR THE OWNER: confirm every item below is a service 4Guard actually provides before launch.

export const CATEGORIES = [
  { id: 'pest', label: 'Pest control', apiValue: 'Fumigation / Pest Control' },
  { id: 'cleaning', label: 'Cleaning', apiValue: 'Cleaning' },
  { id: 'both', label: 'Pest control and cleaning', apiValue: 'Both' },
];

export const PEST_SERVICES = [
  { id: 'cockroaches', label: 'Cockroaches', icon: 'roach', blurb: 'Kitchens, drains and food areas. Treated where they hide and breed, not only where you see them.' },
  { id: 'rodents', label: 'Rats and mice', icon: 'rodent', blurb: 'Baiting, trapping and sealing the gaps they use to get in.' },
  { id: 'termites', label: 'Termites', icon: 'termite', blurb: 'Inspection of timber, walls and soil, then treatment to protect the structure.' },
  { id: 'bedbugs', label: 'Bed bugs', icon: 'bedbug', blurb: 'Mattresses, bed frames and furniture seams, with a follow-up visit.' },
  { id: 'ants', label: 'Ants', icon: 'ant', blurb: 'Trails traced back to the nest so they stop coming back.' },
  { id: 'fleas', label: 'Fleas and ticks', icon: 'flea', blurb: 'Indoor and garden treatment, timed with your pets’ own treatment.' },
  { id: 'flying', label: 'Flies and mosquitoes', icon: 'fly', blurb: 'Breeding sites found and treated, plus screening advice.' },
  { id: 'fumigation', label: 'Full fumigation', icon: 'fumigation', blurb: 'Whole-property fumigation for homes, businesses and warehouses.' },
  { id: 'pest-other', label: 'Not sure / other pest', icon: 'search', blurb: 'Tell us what you are seeing and we will inspect and advise.' },
];

export const CLEANING_SERVICES = [
  { id: 'home', label: 'Home cleaning', icon: 'home', blurb: 'Regular or once-off cleaning of your house or flat.' },
  { id: 'deep', label: 'Deep cleaning', icon: 'sparkle', blurb: 'Top-to-bottom clean including the places routine cleaning misses.' },
  { id: 'office', label: 'Office and commercial', icon: 'office', blurb: 'Offices, shops and restaurants, scheduled around your trading hours.' },
  { id: 'move', label: 'Move-in / move-out', icon: 'box', blurb: 'Empty-property cleaning before you move in or hand back the keys.' },
  { id: 'sanitising', label: 'Sanitising and hygiene', icon: 'spray', blurb: 'Disinfection of high-touch surfaces, bathrooms and food areas.' },
];

export const PROPERTY_TYPES = [
  { id: 'Residential', label: 'Home', premises: ['House', 'Flat or apartment', 'Townhouse', 'Estate or complex'] },
  { id: 'Commercial', label: 'Business', premises: ['Office', 'Restaurant or food business', 'Shop or retail', 'Warehouse or factory', 'School, clinic or other'] },
];

export const TIME_SLOTS = ['Morning (08:00–12:00)', 'Afternoon (12:00–16:00)', 'Any time'];

export const STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

/** Services a booking in this category may include. */
export function servicesFor(categoryApiValue) {
  if (categoryApiValue === 'Fumigation / Pest Control') return PEST_SERVICES;
  if (categoryApiValue === 'Cleaning') return CLEANING_SERVICES;
  if (categoryApiValue === 'Both') return [...PEST_SERVICES, ...CLEANING_SERVICES];
  return [];
}

export const findService = id => [...PEST_SERVICES, ...CLEANING_SERVICES].find(service => service.id === id);
export const categoryById = id => CATEGORIES.find(category => category.id === id);
export const categoryByApiValue = value => CATEGORIES.find(category => category.apiValue === value);
