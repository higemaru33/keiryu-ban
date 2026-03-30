export default async function handler(req: any, res: any) {
  const API_KEY = process.env.STORMGLASS_API_KEY;
  const LAT = 34.48;
  const LNG = 134.08;

  try {
    const response = await fetch(
      `https://api.stormglass.io/v2/weather/point?lat=${LAT}&lng=${LNG}&params=swellHeight,swellDirection,swellPeriod`,
      { headers: { Authorization: API_KEY || '' } }
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch swell data' });
  }
}