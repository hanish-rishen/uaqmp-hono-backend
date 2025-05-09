# UAQMP API Server

## Air Quality Index (AQI) Conversion

This application converts OpenWeather API's AQI scale (1-5) to a standard AQI scale (0-500) commonly used in air quality reporting.

### OpenWeather's AQI Scale

OpenWeather uses a simple 1-5 scale for air quality:

- 1: Good
- 2: Fair
- 3: Moderate
- 4: Poor
- 5: Very Poor

### Standard AQI Scale (0-500)

We convert to a more detailed scale that provides better granularity:

- 0-50: Good (Green) - Air quality is satisfactory, and air pollution poses little or no risk
- 51-100: Moderate (Yellow) - Air quality is acceptable. Some people may be sensitive
- 101-150: Unhealthy for Sensitive Groups (Orange) - Members of sensitive groups may experience health effects
- 151-200: Unhealthy (Red) - Some members of the general public may experience health effects
- 201-300: Very Unhealthy (Purple) - Health alert: everyone may experience more serious health effects
- 301-500: Hazardous (Maroon) - Health warning of emergency conditions

### Conversion Method

The conversion uses the actual pollutant values (PM2.5, PM10, O3, etc.) provided by OpenWeather to calculate a standard AQI based on EPA guidelines. The highest individual pollutant AQI value is used as the overall AQI.

## API Usage

- GET `/api/current?lat=<latitude>&lon=<longitude>` - Get current air quality
- GET `/api/components?lat=<latitude>&lon=<longitude>` - Get detailed component values
- GET `/api/forecast?lat=<latitude>&lon=<longitude>` - Get 24-hour forecast data

## Running the Server

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Or use tsx directly
npx tsx alt-index.ts
```

Make sure to set up your `.env` file with your OpenWeather API key.
#   u a q m p - h o n o - b a c k e n d  
 