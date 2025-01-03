const calculateMaxDateMetrics = (data, tempField, humidityField, datetimeField) => {
  // Parse data to extract relevant fields
  const parsedData = data.map(elem => ({
      datetime: new Date(elem[datetimeField]),
      temp: elem[tempField],
      humidity: elem[humidityField]
  }));

  // Find the max date and current hour
  const maxDatetime = parsedData.reduce((max, elem) => (elem.datetime > max ? elem.datetime : max), new Date(0));
  const maxDate = maxDatetime.toISOString().split('T')[0];
  const currentHour = maxDatetime.getHours();

  // Calculate the previous date
  const prevDate = new Date(maxDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  // Filter data for the current hour on max date and the same hour on the previous date
  const filteredData = parsedData.filter(elem => {
      const elemDate = elem.datetime.toISOString().split('T')[0];
      const elemHour = elem.datetime.getHours();
      return (elemDate === maxDate && elemHour === currentHour) ||
             (elemDate === prevDateStr && elemHour === currentHour);
  });

  // Group data by date
  const groupedData = filteredData.reduce((acc, elem) => {
      const dateKey = elem.datetime.toISOString().split('T')[0];
      acc[dateKey] = acc[dateKey] || { temp: [], humidity: [] };
      if (elem.temp !== null) acc[dateKey].temp.push(elem.temp);
      if (elem.humidity !== null) acc[dateKey].humidity.push(elem.humidity);
      return acc;
  }, {});

  // Calculate averages for each date
  const averages = {};
  for (const [date, metrics] of Object.entries(groupedData)) {
      const k = date === maxDate ? "today" : "yesterday";
      averages[k] = {
          avgTemp: metrics.temp.reduce((sum, val) => sum + val, 0) / metrics.temp.length || null,
          avgHumidity: metrics.humidity.reduce((sum, val) => sum + val, 0) / metrics.humidity.length || null
      };
  }

  return { maxDate, prevDateStr, currentHour, averages };
};


const fetchData = async (url) => {
  try {
      const response = await fetch(url);
      return await response.json();
  } catch (error) {
      console.error("Error fetching data:", error);
      return null;
  }
};

const prepareGroupData = (data, tempField, datetimeField) =>
  data.filter(elem => elem[tempField] !== null)
      .map(elem => ({
          "x": new Date(elem[datetimeField]), 
          "y": elem[tempField]
      }));

const prepareSurfData = (data) => {
  // Step 1: Sort data by duration_hours (date field) in descending order
  const sortedData = [...data].sort((a, b) => new Date(b.duration_hours) - new Date(a.duration_hours));

  // Step 2: Extract unique dates (max and second max)
  const uniqueDates = [...new Set(sortedData.map(item => new Date(item.duration_hours).toISOString().split('T')[0]))];

  const maxDate = uniqueDates[0];
  const secondMaxDate = uniqueDates[1];

  // Step 3: Filter datasets for maxDate and secondMaxDate
  const maxDateData = sortedData.filter(item => item.duration_hours.startsWith(maxDate));
  const secondMaxDateData = secondMaxDate ? sortedData.filter(item => item.duration_hours.startsWith(secondMaxDate)) : [];

  // Step 4: Transform data into the desired format
  const transformData = (data) => {
    return data
      .map(item => {
        const hour = new Date(item.duration_hours).toISOString().split('T')[1].slice(0, 5); // Extract hour (HH:mm)
        return {
            spot_name: item.spot_name,
            hour: hour,
            weighted_sum: item.weighted_sum
        };
      })
      .filter(elem => elem.weighted_sum > 19);
  };

  // Output results
  return {
    firstDate: maxDate,
    secondDate: secondMaxDate,
    firstData: transformData(maxDateData),
    secondData: transformData(secondMaxDateData)
  }
}

const renderHeatmap = async (div_id, title, data) => {
  // Step 1: Extract unique spots (y-axis) and time slots (x-axis)
  const y = [...new Set(data.map(d => d.spot_name))];
  const x = [...new Set(data.map(d => d.hour))].sort();

  // Step 2: Prepare z-matrix (ranks) for heatmap
  const z = y.map(spot =>
    x.map(time => {
      const entry = data.find(d => d.spot_name === spot && d.hour === time);
      return entry ? entry.weighted_sum : 0; // Default to 0 if no rank exists
    })
  );

  // Step 3: Define heatmap trace
  const trace = {
    z: z,
    x: x,
    y: y,
    type: 'heatmap',
    colorscale: [
      [0, 'rgb(50, 50, 50)'],      // Dark grey for low values
      [0.2, 'rgb(62, 69, 85)'],      // Dark grey for low values
      [0.3, 'rgb(50, 120, 200)'], // Intermediate blue
      [1, 'rgb(50, 120, 200)'], // Intermediate blue
    ],
    zmin: 0, // Minimum value for scaling
    zmax: 100, // Maximum value for scaling
    hoverongaps: false,
    showscale: false
  };

  const layout = {
    title: `Surf Forecast (${title})`,
    margin: { t: 30, b: 40, l: 120, r: 0 },
    plot_bgcolor: '#1e1e1e',
    paper_bgcolor: '#1e1e1e',
    annotations: [],
    font: {
        color: '#f0f0f0'
    },
    yaxis: {
      tickangle: 45 // Rotate labels 90 degrees
    },
  };

  for ( var i = 0; i < y.length; i++ ) {
    for ( var j = 0; j < x.length; j++ ) {
      var result = {
        xref: 'x1',
        yref: 'y1',
        x: x[j],
        y: y[i],
        text: z[i][j] > 0 ? z[i][j] : "",
        showarrow: false,
      };
      layout.annotations.push(result);
    }
  }

  // Render plot
  Plotly.newPlot(div_id, [trace], layout, { displayModeBar: false });
}

const renderLine = async (div_id, data, yaxis, yaxis2) => {
  // Prepare data arrays for Plotly
  let plotData = data.map(trace => ({
      x: trace.x.map(point => point.x),  // Extract all x values
      y: trace.x.map(point => point.y),  // Extract all y values
      type: trace.type,
      mode: trace.mode,
      name: trace.name,
      line: trace.line,
      yaxis: trace.yaxis
  }));
  
  // Layout configuration for dark mode
  let layout = {
      // title: 'Sample Plot in Dark Mode',
      xaxis: {
          type: 'date',
          tickformat: '%Y-%m-%d',  // Formatting x-axis to show only date in yyyy-mm-dd format
          dtick: 'D1',  // This ensures that the x-axis ticks are spaced by 1 day
          ticks: 'outside',
          tickangle: 45,
          tickmode: 'array',
          tickvals: 7,
          showgrid: false,
          gridcolor: '#3a3a3a'
      },
      plot_bgcolor: '#1e1e1e',
      paper_bgcolor: '#1e1e1e',
      font: {
          color: '#f0f0f0'
      },
      hovermode: 'closest',
      showlegend: false,  // Show the legend
      legend: {
          bgcolor: '#cdcdcd',  // Dark background for legend
          bordercolor: '#89a189',  // Border color around legend
          borderwidth: 1,  // Border width
          font: {
              color: '#444d44'  // Light font color for the legend
          }
      }
  };

  if (yaxis) {
      layout["yaxis"] = {
          title: yaxis,
          showgrid: false,
          gridcolor: '#3a3a3a'
      }
  }

  if (yaxis2) {
      layout["yaxis2"] = {
          title: yaxis2,
          overlaying: 'y',
          side: 'right',
          showgrid: false,
          gridcolor: '#3a3a3a'
      }
  }
  
  Plotly.newPlot(div_id, plotData, layout);
}

const renderIndicators = async (div_id, indoor, outdoor) => {
  let i_t;
  let i_t_d;
  let o_t;
  let o_t_d;
  let i_h;
  let i_h_d;
  let o_h;
  let o_h_d;

  if (indoor) {
    if (indoor.averages.today) {
      i_t = indoor.averages.today.avgTemp
      i_h = indoor.averages.today.avgHumidity
    }
    if (indoor.averages.yesterday) {
      i_t_d = indoor.averages.yesterday.avgTemp
      i_h_d = indoor.averages.yesterday.avgHumidity
    }
  }
  if (outdoor) {
    if (outdoor.averages.today) {
      o_t = outdoor.averages.today.avgTemp
      o_h = outdoor.averages.today.avgHumidity
    }
    if (outdoor.averages.yesterday) {
      o_t_d = outdoor.averages.yesterday.avgTemp
      o_h_d = outdoor.averages.yesterday.avgHumidity
    }
  }

  const data = [
    {
      title: { text: "Indoor Temperature" },
      type: "indicator",
      mode: "number+delta",
      value: i_t,
      domain: { row: 0, column: 0 },
      delta: {
        reference: i_t_d,
        increasing: { color: "green" },
        decreasing: { color: "red" }
      },
    },
    {
      title: { text: "Outside Temperature" },
      type: "indicator",
      mode: "number+delta",
      value: o_t,
      domain: { row: 1, column: 0 },
      delta: {
        reference: o_t_d,
        increasing: { color: "green" },
        decreasing: { color: "red" }
      },
    },
    {
      title: { text: "Indoor Humidity" },
      type: "indicator",
      mode: "number+delta",
      value: i_h,
      delta: {
        reference: i_h_d,
        increasing: { color: "red" }, 
        decreasing: { color: "green" }
      },
      domain: { row: 2, column: 0 }
    },
    {
      title: { text: "Outside Humidity" },
      type: "indicator",
      mode: "number+delta",
      value: o_h,
      delta: {
        reference: o_h_d,
        increasing: { color: "red" }, 
        decreasing: { color: "green" }
      },
      domain: { row: 3, column: 0 }
    },
  ];
  
  const layout = {
    margin: { t: 25, b: 25, l: 25, r: 25 },
    grid: { rows: 4, columns: 1, pattern: "independent" },
    plot_bgcolor: '#1e1e1e',
    paper_bgcolor: '#1e1e1e',
    font: {
        color: '#f0f0f0'
    },
    template: {
      data: {
        indicator: [
          {
            mode: "number+delta+gauge",
          }
        ]
      }
    }
  };

  Plotly.newPlot(div_id, data, layout);
}

const renderApp = async () => {
    const url = "https://reorg.azurewebsites.net/api/metrics";
    // const data = await fetchData(url);

    if (!data) return; // Exit if data fetching fails

    // Prepare data

    const indoorData = data.metrics;
    const outdoorData = data.weather;

    const indoorMetrics = calculateMaxDateMetrics(indoorData, "temperature_c", "humidity", "datetime");
    const outdoorMetrics = calculateMaxDateMetrics(outdoorData, "temperature", "humidity", "datetime");

    const dataIndoorTemp = prepareGroupData(indoorData, "temperature_c", "datetime");
    const dataOutsideTemp = prepareGroupData(outdoorData, "temperature", "datetime");
    // const dataOutsideRain = prepareGroupData(outdoorData, "precipitation_probability", "datetime");

    const dataTemp = [
        {
            x: dataIndoorTemp,
            type: 'line',
            mode: 'lines',
            name: 'Indoor Temperature',
            line: { color: '#815be3' },
            yaxis: 'y1' 
        },
        {
            x: dataOutsideTemp,
            type: 'line',
            mode: 'lines',
            name: 'Outdoor Temperature',
            line: { color: '#1a8a1e' },
            yaxis: 'y1' 
        }
    ];

    const {
      firstDate,
      secondDate,
      firstData, 
      secondData
    } = prepareSurfData(data.surf.filter(elem => elem.rank === 1))
    
    renderLine("plot_temp", dataTemp, "Temperature °C")
    renderIndicators(
      "plot_indicators",
      indoorMetrics,
      outdoorMetrics
    )
    if (secondDate && secondData.length > 0) {
      renderHeatmap("plot_heatmap_1", secondDate, secondData)
    }
    if (firstDate && firstData.length > 0) {
      renderHeatmap("plot_heatmap_2", firstDate, firstData)
    }
};

document.addEventListener('DOMContentLoaded', renderApp);


const data = {
  "metrics": [
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T17:55:57.736Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T17:40:57.278Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T17:25:56.697Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T17:10:56.214Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T16:55:55.719Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T16:40:55.239Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T16:25:54.768Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T16:10:54.220Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T15:55:51.568Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T15:40:53.248Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T15:25:50.562Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-03T15:10:52.239Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T14:55:53.989Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-03T14:40:49.039Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-03T14:25:48.555Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-03T14:10:50.310Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-03T13:55:47.717Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-03T13:40:51.520Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-03T13:25:48.740Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-03T13:10:50.471Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T12:55:45.525Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-03T12:40:45.018Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T12:25:44.555Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T12:10:44.680Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T11:55:45.848Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-03T11:40:43.077Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-03T11:25:44.996Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-03T11:10:46.957Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-03T10:55:44.240Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-03T10:40:46.005Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-03T10:25:41.034Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-03T10:10:40.496Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-03T09:55:40.030Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-03T09:40:41.713Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-03T09:25:41.242Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T09:10:38.545Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T08:55:39.998Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T08:40:37.602Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T08:25:38.128Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T07:56:27.983Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T07:41:25.253Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T07:26:24.637Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T07:11:24.117Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T06:56:26.369Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T06:41:25.634Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T06:26:22.977Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T06:11:24.509Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T05:56:24.017Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T05:41:23.539Z"
      },
      {
          "temperature_c": 14,
          "humidity": 42,
          "datetime": "2025-01-03T05:26:25.269Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T05:11:18.053Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T04:56:24.244Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T04:41:17.177Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T04:26:16.518Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T04:11:18.372Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T03:56:17.812Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T03:41:19.458Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T03:26:18.942Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T03:11:16.384Z"
      },
      {
          "temperature_c": 15,
          "humidity": 42,
          "datetime": "2025-01-03T02:56:13.591Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-03T02:41:15.359Z"
      },
      {
          "temperature_c": 15,
          "humidity": 42,
          "datetime": "2025-01-03T02:26:14.926Z"
      },
      {
          "temperature_c": 15,
          "humidity": 42,
          "datetime": "2025-01-03T02:11:21.168Z"
      },
      {
          "temperature_c": 15,
          "humidity": 42,
          "datetime": "2025-01-03T01:56:11.634Z"
      },
      {
          "temperature_c": 15,
          "humidity": 42,
          "datetime": "2025-01-03T01:41:15.642Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-03T01:26:10.548Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-03T01:11:12.329Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-03T00:56:16.259Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-03T00:41:09.027Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-03T00:26:13.078Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-03T00:11:12.532Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-02T23:56:07.611Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-02T23:41:11.496Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-02T23:26:08.888Z"
      },
      {
          "temperature_c": 15,
          "humidity": 44,
          "datetime": "2025-01-02T23:11:08.396Z"
      },
      {
          "temperature_c": 16,
          "humidity": 44,
          "datetime": "2025-01-02T22:56:10.682Z"
      },
      {
          "temperature_c": 16,
          "humidity": 46,
          "datetime": "2025-01-02T22:41:09.588Z"
      },
      {
          "temperature_c": 16,
          "humidity": 49,
          "datetime": "2025-01-02T22:26:11.956Z"
      },
      {
          "temperature_c": 16,
          "humidity": 49,
          "datetime": "2025-01-02T22:11:13.831Z"
      },
      {
          "temperature_c": 16,
          "humidity": 46,
          "datetime": "2025-01-02T21:56:04.499Z"
      },
      {
          "temperature_c": 16,
          "humidity": 44,
          "datetime": "2025-01-02T21:41:03.970Z"
      },
      {
          "temperature_c": 16,
          "humidity": 44,
          "datetime": "2025-01-02T21:26:10.179Z"
      },
      {
          "temperature_c": 16,
          "humidity": 44,
          "datetime": "2025-01-02T21:11:05.370Z"
      },
      {
          "temperature_c": 16,
          "humidity": 44,
          "datetime": "2025-01-02T20:56:09.297Z"
      },
      {
          "temperature_c": 16,
          "humidity": 45,
          "datetime": "2025-01-02T20:41:06.351Z"
      },
      {
          "temperature_c": 16,
          "humidity": 46,
          "datetime": "2025-01-02T20:26:01.502Z"
      },
      {
          "temperature_c": 16,
          "humidity": 46,
          "datetime": "2025-01-02T20:11:09.827Z"
      },
      {
          "temperature_c": 16,
          "humidity": 51,
          "datetime": "2025-01-02T19:56:00.506Z"
      },
      {
          "temperature_c": 16,
          "humidity": 54,
          "datetime": "2025-01-02T19:41:00.039Z"
      },
      {
          "temperature_c": 16,
          "humidity": 54,
          "datetime": "2025-01-02T19:26:06.135Z"
      },
      {
          "temperature_c": 16,
          "humidity": 50,
          "datetime": "2025-01-02T19:11:03.143Z"
      },
      {
          "temperature_c": 16,
          "humidity": 45,
          "datetime": "2025-01-02T18:56:02.749Z"
      },
      {
          "temperature_c": 16,
          "humidity": 45,
          "datetime": "2025-01-02T18:41:00.416Z"
      },
      {
          "temperature_c": 16,
          "humidity": 43,
          "datetime": "2025-01-02T18:25:59.743Z"
      },
      {
          "temperature_c": 16,
          "humidity": 43,
          "datetime": "2025-01-02T18:11:17.132Z"
      },
      {
          "temperature_c": 16,
          "humidity": 43,
          "datetime": "2025-01-02T17:55:59.907Z"
      },
      {
          "temperature_c": 16,
          "humidity": 43,
          "datetime": "2025-01-02T17:26:48.836Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-30T00:56:11.314Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-30T00:41:12.986Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-30T00:26:10.317Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-30T00:11:07.696Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T23:56:16.079Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T23:41:06.435Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T23:26:06.210Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T23:11:05.612Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T22:56:14.161Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T22:41:08.106Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T22:26:05.161Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T22:11:06.903Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T21:56:08.596Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T21:41:06.197Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T21:26:05.548Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T21:11:04.842Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T20:56:06.607Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T20:41:12.810Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T20:26:03.463Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T20:11:05.176Z"
      },
      {
          "temperature_c": 12,
          "humidity": 45,
          "datetime": "2024-12-29T19:56:02.582Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T19:40:59.776Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T19:26:01.629Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T19:11:01.043Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T18:56:02.414Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T18:41:02.008Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T18:26:02.039Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2024-12-29T18:11:01.133Z"
      }
  ],
  "weather": [
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -0.85,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-03T17:55:56.073Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -0.85,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-03T17:40:55.750Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -0.72,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-03T17:25:54.963Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -0.72,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-03T17:10:54.530Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -0.43,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-03T16:55:53.989Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2,
          "temperature_apparent": -0.29,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-03T16:40:53.778Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.13,
          "temperature_apparent": 0,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-03T16:25:53.070Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": 0.07,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-03T16:10:52.459Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": 0.44,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-03T15:55:52.228Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": 1.02,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-03T15:40:51.747Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.19,
          "temperature_apparent": 1.38,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-03T15:25:51.201Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.63,
          "temperature_apparent": 1.89,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-03T15:10:50.497Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.69,
          "temperature_apparent": 1.82,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-03T14:55:50.069Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.88,
          "temperature_apparent": 1.91,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-03T14:40:49.964Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.13,
          "temperature_apparent": 2.14,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-03T14:25:49.174Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.31,
          "temperature_apparent": 2.24,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-03T14:10:48.670Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 2.09,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-03T13:55:48.303Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 2.03,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T13:40:47.720Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 2.03,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T13:25:47.007Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 2.03,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T13:10:46.567Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.13,
          "temperature_apparent": 1.96,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T12:55:46.100Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": 1.81,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T12:40:45.965Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.88,
          "temperature_apparent": 1.66,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T12:25:45.198Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.69,
          "temperature_apparent": 1.44,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T12:10:45.362Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.5,
          "temperature_apparent": 1.22,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T11:55:44.186Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.31,
          "temperature_apparent": 1,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T11:40:43.885Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": 0.78,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T11:25:43.265Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": 0.48,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T11:10:43.067Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.63,
          "temperature_apparent": 0.07,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-03T10:55:42.512Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -0.3,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-03T10:40:42.379Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2,
          "temperature_apparent": -0.79,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-03T10:25:41.547Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.07,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-03T10:10:41.072Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.38,
          "temperature_apparent": -1.53,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-03T09:55:40.547Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -1.58,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-03T09:40:40.068Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.69,
          "temperature_apparent": -2.03,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-03T09:25:39.454Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -2.33,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-03T09:10:39.139Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -2.48,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-03T08:55:40.658Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -2.69,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-03T08:40:38.244Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -2.81,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-03T08:25:38.699Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.88,
          "temperature_apparent": -3.06,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T07:56:24.081Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.88,
          "temperature_apparent": -3.06,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T07:41:23.633Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.88,
          "temperature_apparent": -2.97,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T07:26:23.195Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -3.11,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T07:11:22.627Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -3.11,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T06:56:22.549Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -3.11,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T06:41:22.530Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -3.11,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T06:26:21.483Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T06:11:20.698Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T05:56:20.227Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T05:41:19.619Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.88,
          "temperature_apparent": -2.77,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T05:26:19.453Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.88,
          "temperature_apparent": -2.56,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-03T05:11:18.769Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T04:56:18.140Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T04:41:17.851Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T04:26:17.498Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T04:11:16.756Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.69,
          "temperature_apparent": -2.56,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-03T03:56:16.118Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.63,
          "temperature_apparent": -2.68,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T03:41:15.573Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.63,
          "temperature_apparent": -2.68,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T03:26:15.082Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -2.54,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T03:11:14.726Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -2.54,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-03T02:56:14.320Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.38,
          "temperature_apparent": -2.49,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T02:41:13.717Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -2.41,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T02:26:13.305Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -2.41,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T02:11:12.772Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -2.41,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T01:56:12.262Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -2.27,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T01:41:11.798Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -2.27,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T01:26:11.341Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -2.27,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-03T01:11:11.063Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.13,
          "temperature_apparent": -2.37,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-03T00:56:10.122Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0,
          "temperature_apparent": -2.23,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-03T00:41:09.739Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -2.17,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-03T00:26:09.165Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.95,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-03T00:11:08.819Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.95,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-02T23:56:08.302Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.95,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-02T23:41:07.602Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.95,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-02T23:26:07.252Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -1.88,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-02T23:11:07.034Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -1.88,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-02T22:56:07.180Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -1.8,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-02T22:41:05.765Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.87,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-02T22:26:05.994Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.7,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-02T22:11:05.760Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.7,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-02T21:56:05.490Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.61,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-02T21:41:04.986Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.61,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-02T21:26:04.213Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.61,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-02T21:11:03.912Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -1.56,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-02T20:56:03.527Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -1.35,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-02T20:41:02.932Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -1.42,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-02T20:26:02.689Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0,
          "temperature_apparent": 0,
          "uv_index": 0,
          "wind_speed": 1.31,
          "datetime": "2025-01-02T20:11:01.950Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": 0.13,
          "uv_index": 0,
          "wind_speed": 1.19,
          "datetime": "2025-01-02T19:56:01.412Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": 0.19,
          "uv_index": 0,
          "wind_speed": 1.13,
          "datetime": "2025-01-02T19:41:01.008Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": 0.19,
          "uv_index": 0,
          "wind_speed": 1,
          "datetime": "2025-01-02T19:26:00.146Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": 0.31,
          "uv_index": 0,
          "wind_speed": 1,
          "datetime": "2025-01-02T19:10:59.577Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": 0.38,
          "uv_index": 0,
          "wind_speed": 1,
          "datetime": "2025-01-02T18:55:59.023Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": 0.38,
          "uv_index": 0,
          "wind_speed": 1.13,
          "datetime": "2025-01-02T18:40:58.692Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -1.06,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-02T18:25:58.085Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.81,
          "temperature_apparent": -0.85,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-02T18:10:57.937Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.88,
          "temperature_apparent": -0.77,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-02T17:55:58.677Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -0.49,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-02T17:26:47.770Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.63,
          "datetime": "2024-12-30T00:56:09.773Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2024-12-30T00:41:09.153Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2024-12-30T00:26:08.679Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2024-12-30T00:11:08.488Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2024-12-29T23:56:07.720Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2024-12-29T23:41:07.145Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2024-12-29T23:26:06.999Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2024-12-29T23:11:06.600Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2024-12-29T22:56:05.758Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2024-12-29T22:41:06.995Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2024-12-29T22:26:06.112Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2024-12-29T22:11:05.550Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.63,
          "temperature_apparent": 7.63,
          "uv_index": 0,
          "wind_speed": 4.13,
          "datetime": "2024-12-29T21:56:04.876Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.5,
          "temperature_apparent": 7.5,
          "uv_index": 0,
          "wind_speed": 4,
          "datetime": "2024-12-29T21:41:04.498Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.5,
          "temperature_apparent": 7.5,
          "uv_index": 0,
          "wind_speed": 4,
          "datetime": "2024-12-29T21:26:03.853Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.5,
          "temperature_apparent": 7.5,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2024-12-29T21:11:03.429Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.5,
          "temperature_apparent": 7.5,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2024-12-29T20:56:03.079Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.38,
          "temperature_apparent": 7.38,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2024-12-29T20:41:02.413Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.31,
          "temperature_apparent": 7.31,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2024-12-29T20:26:01.852Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.31,
          "temperature_apparent": 7.31,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2024-12-29T20:11:01.679Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2024-12-29T19:56:00.999Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2024-12-29T19:41:00.760Z"
      },
      {
          "humidity": 99,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2024-12-29T19:25:59.872Z"
      },
      {
          "humidity": 99,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2024-12-29T19:10:59.595Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 4,
          "datetime": "2024-12-29T18:55:58.663Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 4,
          "datetime": "2024-12-29T18:40:58.398Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7.19,
          "temperature_apparent": 7.19,
          "uv_index": 0,
          "wind_speed": 4,
          "datetime": "2024-12-29T18:25:58.759Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 7,
          "temperature_apparent": 7,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2024-12-29T18:10:57.605Z"
      }
  ],
  "surf": [
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T12:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 3.12487,
          "dawn": "2025-01-05T07:40:35.000Z",
          "sunrise": "2025-01-05T08:20:08.000Z",
          "sunset": "2025-01-05T16:21:46.000Z",
          "dusk": "2025-01-05T17:01:19.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T09:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 6.46978,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T10:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 8.28367,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T11:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 10.77103,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T12:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 13.11063,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T13:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 13.04585,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T14:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 14.18663,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T15:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 15.13731,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Hive Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T08:00:00.000Z",
          "timestamp": 1.8,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 8.97871,
          "dawn": "2025-01-04T07:34:35.000Z",
          "sunrise": "2025-01-04T08:13:21.000Z",
          "sunset": "2025-01-04T16:20:34.000Z",
          "dusk": "2025-01-04T16:59:20.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Hive Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T14:00:00.000Z",
          "timestamp": 1.8,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 15.4752,
          "dawn": "2025-01-04T07:34:35.000Z",
          "sunrise": "2025-01-04T08:13:21.000Z",
          "sunset": "2025-01-04T16:20:34.000Z",
          "dusk": "2025-01-04T16:59:20.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Hive Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T15:00:00.000Z",
          "timestamp": 1.8,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 15.89284,
          "dawn": "2025-01-04T07:34:35.000Z",
          "sunrise": "2025-01-04T08:13:21.000Z",
          "sunset": "2025-01-04T16:20:34.000Z",
          "dusk": "2025-01-04T16:59:20.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Cogden",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T08:00:00.000Z",
          "timestamp": 1.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 8.97871,
          "dawn": "2025-01-04T07:34:31.000Z",
          "sunrise": "2025-01-04T08:13:16.000Z",
          "sunset": "2025-01-04T16:20:32.000Z",
          "dusk": "2025-01-04T16:59:17.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Cogden",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T15:00:00.000Z",
          "timestamp": 1.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 15.89284,
          "dawn": "2025-01-04T07:34:31.000Z",
          "sunrise": "2025-01-04T08:13:16.000Z",
          "sunset": "2025-01-04T16:20:32.000Z",
          "dusk": "2025-01-04T16:59:17.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Cogden",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T14:00:00.000Z",
          "timestamp": 1.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 15.4752,
          "dawn": "2025-01-04T07:34:31.000Z",
          "sunrise": "2025-01-04T08:13:16.000Z",
          "sunset": "2025-01-04T16:20:32.000Z",
          "dusk": "2025-01-04T16:59:17.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T11:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 4.31359,
          "dawn": "2025-01-05T07:40:35.000Z",
          "sunrise": "2025-01-05T08:20:08.000Z",
          "sunset": "2025-01-05T16:21:46.000Z",
          "dusk": "2025-01-05T17:01:19.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T10:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 5.77978,
          "dawn": "2025-01-05T07:40:35.000Z",
          "sunrise": "2025-01-05T08:20:08.000Z",
          "sunset": "2025-01-05T16:21:46.000Z",
          "dusk": "2025-01-05T17:01:19.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T11:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 4.31359,
          "dawn": "2025-01-05T07:40:47.000Z",
          "sunrise": "2025-01-05T08:20:21.000Z",
          "sunset": "2025-01-05T16:21:49.000Z",
          "dusk": "2025-01-05T17:01:23.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T10:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 5.77978,
          "dawn": "2025-01-05T07:40:47.000Z",
          "sunrise": "2025-01-05T08:20:21.000Z",
          "sunset": "2025-01-05T16:21:49.000Z",
          "dusk": "2025-01-05T17:01:23.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T09:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 6.91413,
          "dawn": "2025-01-05T07:40:47.000Z",
          "sunrise": "2025-01-05T08:20:21.000Z",
          "sunset": "2025-01-05T16:21:49.000Z",
          "dusk": "2025-01-05T17:01:23.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-05T08:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 7,
          "wind_speed": 7.18516,
          "dawn": "2025-01-05T07:40:47.000Z",
          "sunrise": "2025-01-05T08:20:21.000Z",
          "sunset": "2025-01-05T16:21:49.000Z",
          "dusk": "2025-01-05T17:01:23.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "West Bexington",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T15:00:00.000Z",
          "timestamp": 1.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 15.89284,
          "dawn": "2025-01-04T07:34:18.000Z",
          "sunrise": "2025-01-04T08:13:02.000Z",
          "sunset": "2025-01-04T16:20:27.000Z",
          "dusk": "2025-01-04T16:59:11.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "West Bexington",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T14:00:00.000Z",
          "timestamp": 1.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 15.4752,
          "dawn": "2025-01-04T07:34:18.000Z",
          "sunrise": "2025-01-04T08:13:02.000Z",
          "sunset": "2025-01-04T16:20:27.000Z",
          "dusk": "2025-01-04T16:59:11.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "West Bexington",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-04T08:00:00.000Z",
          "timestamp": 1.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 10,
          "wind_speed": 8.97871,
          "dawn": "2025-01-04T07:34:18.000Z",
          "sunrise": "2025-01-04T08:13:02.000Z",
          "sunset": "2025-01-04T16:20:27.000Z",
          "dusk": "2025-01-04T16:59:11.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.888Z"
      },
      {
          "spot_name": "Whitsand Bay",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.47712,
          "dawn": "2025-01-03T07:39:46.000Z",
          "sunrise": "2025-01-03T08:18:13.000Z",
          "sunset": "2025-01-03T16:27:17.000Z",
          "dusk": "2025-01-03T17:05:43.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Whitsand Bay",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.09185,
          "dawn": "2025-01-03T07:39:46.000Z",
          "sunrise": "2025-01-03T08:18:13.000Z",
          "sunset": "2025-01-03T16:27:17.000Z",
          "dusk": "2025-01-03T17:05:43.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Portwrinkle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.64612,
          "dawn": "2025-01-03T07:39:57.000Z",
          "sunrise": "2025-01-03T08:18:24.000Z",
          "sunset": "2025-01-03T16:27:23.000Z",
          "dusk": "2025-01-03T17:05:50.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Portwrinkle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.60998,
          "dawn": "2025-01-03T07:39:57.000Z",
          "sunrise": "2025-01-03T08:18:24.000Z",
          "sunset": "2025-01-03T16:27:23.000Z",
          "dusk": "2025-01-03T17:05:50.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Portwrinkle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.47712,
          "dawn": "2025-01-03T07:39:57.000Z",
          "sunrise": "2025-01-03T08:18:24.000Z",
          "sunset": "2025-01-03T16:27:23.000Z",
          "dusk": "2025-01-03T17:05:50.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Portwrinkle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.09185,
          "dawn": "2025-01-03T07:39:57.000Z",
          "sunrise": "2025-01-03T08:18:24.000Z",
          "sunset": "2025-01-03T16:27:23.000Z",
          "dusk": "2025-01-03T17:05:50.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Downderry",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.23859,
          "dawn": "2025-01-03T07:40:10.000Z",
          "sunrise": "2025-01-03T08:18:37.000Z",
          "sunset": "2025-01-03T16:27:36.000Z",
          "dusk": "2025-01-03T17:06:04.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Downderry",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.00641,
          "dawn": "2025-01-03T07:40:10.000Z",
          "sunrise": "2025-01-03T08:18:37.000Z",
          "sunset": "2025-01-03T16:27:36.000Z",
          "dusk": "2025-01-03T17:06:04.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Downderry",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.02692,
          "dawn": "2025-01-03T07:40:10.000Z",
          "sunrise": "2025-01-03T08:18:37.000Z",
          "sunset": "2025-01-03T16:27:36.000Z",
          "dusk": "2025-01-03T17:06:04.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Downderry",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.94389,
          "dawn": "2025-01-03T07:40:10.000Z",
          "sunrise": "2025-01-03T08:18:37.000Z",
          "sunset": "2025-01-03T16:27:36.000Z",
          "dusk": "2025-01-03T17:06:04.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Seaton Beach",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T13:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.63071,
          "dawn": "2025-01-03T07:40:14.000Z",
          "sunrise": "2025-01-03T08:18:42.000Z",
          "sunset": "2025-01-03T16:27:39.000Z",
          "dusk": "2025-01-03T17:06:07.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Seaton Beach",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.23859,
          "dawn": "2025-01-03T07:40:14.000Z",
          "sunrise": "2025-01-03T08:18:42.000Z",
          "sunset": "2025-01-03T16:27:39.000Z",
          "dusk": "2025-01-03T17:06:07.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Seaton Beach",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T12:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.53684,
          "dawn": "2025-01-03T07:40:14.000Z",
          "sunrise": "2025-01-03T08:18:42.000Z",
          "sunset": "2025-01-03T16:27:39.000Z",
          "dusk": "2025-01-03T17:06:07.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Whitsand Bay",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.60998,
          "dawn": "2025-01-03T07:39:46.000Z",
          "sunrise": "2025-01-03T08:18:13.000Z",
          "sunset": "2025-01-03T16:27:17.000Z",
          "dusk": "2025-01-03T17:05:43.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.09185,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.47712,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.60998,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.64612,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T12:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.64266,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T13:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.57055,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Tregantle",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T14:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.83386,
          "dawn": "2025-01-03T07:39:44.000Z",
          "sunrise": "2025-01-03T08:18:11.000Z",
          "sunset": "2025-01-03T16:27:15.000Z",
          "dusk": "2025-01-03T17:05:42.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Newgale",
          "sub_region": "South Pembrokeshire",
          "duration_hours": "2025-01-04T08:00:00.000Z",
          "timestamp": 2.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 11.38797,
          "dawn": "2025-01-04T07:48:21.000Z",
          "sunrise": "2025-01-04T08:28:29.000Z",
          "sunset": "2025-01-04T16:24:41.000Z",
          "dusk": "2025-01-04T17:04:49.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Newgale",
          "sub_region": "South Pembrokeshire",
          "duration_hours": "2025-01-04T09:00:00.000Z",
          "timestamp": 2.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 13.51449,
          "dawn": "2025-01-04T07:48:21.000Z",
          "sunrise": "2025-01-04T08:28:29.000Z",
          "sunset": "2025-01-04T16:24:41.000Z",
          "dusk": "2025-01-04T17:04:49.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Newgale",
          "sub_region": "South Pembrokeshire",
          "duration_hours": "2025-01-04T11:00:00.000Z",
          "timestamp": 2.9,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 15.99721,
          "dawn": "2025-01-04T07:48:21.000Z",
          "sunrise": "2025-01-04T08:28:29.000Z",
          "sunset": "2025-01-04T16:24:41.000Z",
          "dusk": "2025-01-04T17:04:49.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Pembrey",
          "sub_region": "Gower",
          "duration_hours": "2025-01-04T08:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 11,
          "wind_speed": 6.10985,
          "dawn": "2025-01-04T07:44:28.000Z",
          "sunrise": "2025-01-04T08:24:23.000Z",
          "sunset": "2025-01-04T16:22:19.000Z",
          "dusk": "2025-01-04T17:02:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T16:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.04308,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T14:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.99279,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T13:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.12158,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T12:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.72405,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.67646,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.96227,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.99916,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.27428,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T17:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 7.50206,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Seaton Beach",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.00641,
          "dawn": "2025-01-03T07:40:14.000Z",
          "sunrise": "2025-01-03T08:18:42.000Z",
          "sunset": "2025-01-03T16:27:39.000Z",
          "dusk": "2025-01-03T17:06:07.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T15:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.36951,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T14:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.99279,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T13:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.12158,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T12:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.72405,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.67646,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.96227,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.99916,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Challaborough",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.27428,
          "dawn": "2025-01-03T07:38:01.000Z",
          "sunrise": "2025-01-03T08:16:24.000Z",
          "sunset": "2025-01-03T16:26:04.000Z",
          "dusk": "2025-01-03T17:04:27.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T16:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.04308,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Seaton Beach",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.02692,
          "dawn": "2025-01-03T07:40:14.000Z",
          "sunrise": "2025-01-03T08:18:42.000Z",
          "sunset": "2025-01-03T16:27:39.000Z",
          "dusk": "2025-01-03T17:06:07.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Seaton Beach",
          "sub_region": "South Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.7,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.94389,
          "dawn": "2025-01-03T07:40:14.000Z",
          "sunrise": "2025-01-03T08:18:42.000Z",
          "sunset": "2025-01-03T16:27:39.000Z",
          "dusk": "2025-01-03T17:06:07.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Northcott Mouth",
          "sub_region": "North Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.8,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 9,
          "wind_speed": 2.15395,
          "dawn": "2025-01-03T07:42:37.000Z",
          "sunrise": "2025-01-03T08:21:37.000Z",
          "sunset": "2025-01-03T16:26:05.000Z",
          "dusk": "2025-01-03T17:05:06.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Duckpool",
          "sub_region": "North Cornwall",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.8,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 9,
          "wind_speed": 8.88719,
          "dawn": "2025-01-03T07:42:43.000Z",
          "sunrise": "2025-01-03T08:21:46.000Z",
          "sunset": "2025-01-03T16:25:58.000Z",
          "dusk": "2025-01-03T17:05:01.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T17:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.07939,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T16:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.06527,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T15:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.19921,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T14:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.74705,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T12:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.14857,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.6807,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.8961,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.71371,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.22455,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T17:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 7.50206,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Bantham",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T15:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.36951,
          "dawn": "2025-01-03T07:37:56.000Z",
          "sunrise": "2025-01-03T08:16:18.000Z",
          "sunset": "2025-01-03T16:26:02.000Z",
          "dusk": "2025-01-03T17:04:24.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Thurlestone",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T13:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.81533,
          "dawn": "2025-01-03T07:37:48.000Z",
          "sunrise": "2025-01-03T08:16:09.000Z",
          "sunset": "2025-01-03T16:26:01.000Z",
          "dusk": "2025-01-03T17:04:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.887Z"
      },
      {
          "spot_name": "Kimmeridge Bay",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-03T15:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 7.458,
          "dawn": "2025-01-03T07:32:05.000Z",
          "sunrise": "2025-01-03T08:10:50.000Z",
          "sunset": "2025-01-03T16:17:30.000Z",
          "dusk": "2025-01-03T16:56:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Kimmeridge Bay",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-03T16:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 7.08272,
          "dawn": "2025-01-03T07:32:05.000Z",
          "sunrise": "2025-01-03T08:10:50.000Z",
          "sunset": "2025-01-03T16:17:30.000Z",
          "dusk": "2025-01-03T16:56:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.27428,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T09:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.99916,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T10:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.96227,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T11:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.67646,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T12:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.72405,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T13:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.12158,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T14:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 4.99279,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T15:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 5.36951,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T16:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 6.04308,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Wembury",
          "sub_region": "South Devon",
          "duration_hours": "2025-01-03T17:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 8,
          "wind_speed": 7.50206,
          "dawn": "2025-01-03T07:38:52.000Z",
          "sunrise": "2025-01-03T08:17:16.000Z",
          "sunset": "2025-01-03T16:26:41.000Z",
          "dusk": "2025-01-03T17:05:05.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      },
      {
          "spot_name": "Kimmeridge Bay",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-03T08:00:00.000Z",
          "timestamp": 2.3,
          "min_wave_size": 2,
          "max_wave_size": 3,
          "swell_period": 9,
          "wind_speed": 4.68205,
          "dawn": "2025-01-03T07:32:05.000Z",
          "sunrise": "2025-01-03T08:10:50.000Z",
          "sunset": "2025-01-03T16:17:30.000Z",
          "dusk": "2025-01-03T16:56:14.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 20,
          "datetime": "2025-01-03T08:49:40.886Z"
      }
  ]
}