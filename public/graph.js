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
      // .filter(elem => elem.weighted_sum > 19);
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
      [0.8, 'rgb(50, 50, 50)'],      // Dark grey for low values
      [1, 'rgb(50, 120, 200)'], // Intermediate blue
    ],
    zmin: 0, // Minimum value for scaling
    zmax: 20, // Maximum value for scaling
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
        text: z[i][j] > 0 ? z[i][j].toFixed(2) : "",
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
    } = prepareSurfData(data.surf.filter(elem => elem.rank < 5))

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
          "humidity": 43,
          "datetime": "2025-01-09T23:56:10.307Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T23:41:11.301Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T23:26:15.991Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T23:11:12.485Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T22:56:12.309Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T22:41:12.416Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T22:26:06.335Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T22:11:07.992Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T21:56:05.312Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T21:41:07.036Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T21:26:08.748Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T21:11:04.206Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T20:56:05.816Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T20:41:02.855Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T20:26:02.451Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T20:11:01.914Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T19:56:03.530Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T19:41:03.038Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T19:26:02.509Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-09T19:11:02.017Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T18:56:04.022Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T18:41:01.486Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T18:26:01.092Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T18:10:58.351Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T17:55:59.991Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T17:40:59.503Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T17:25:59.019Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T17:10:58.545Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T16:55:55.825Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T16:40:55.310Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T16:25:57.018Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T16:10:54.355Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T15:55:53.862Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T15:40:55.456Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T15:25:57.267Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T15:10:56.724Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T14:55:54.019Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T14:40:53.537Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T14:25:52.988Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-09T14:10:50.302Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T13:55:49.799Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T13:40:49.280Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T13:25:50.089Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T13:10:48.323Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T12:55:50.014Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T12:40:49.530Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T12:25:46.930Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T12:10:46.405Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T11:55:45.825Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T11:40:47.465Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T11:25:44.771Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T11:10:46.471Z"
      },
      {
          "temperature_c": 12,
          "humidity": 44,
          "datetime": "2025-01-09T10:55:46.070Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T10:40:43.346Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T10:10:44.505Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T09:55:41.785Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T09:40:43.496Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T09:25:45.252Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T09:10:40.300Z"
      },
      {
          "temperature_c": 12,
          "humidity": 43,
          "datetime": "2025-01-09T08:55:42.467Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T08:40:43.158Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T08:25:40.161Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T07:56:34.634Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T07:41:34.480Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T07:26:31.167Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T07:11:35.391Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T06:56:30.054Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T06:41:25.153Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T06:26:29.357Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T06:11:33.365Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T05:56:23.715Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T05:41:34.661Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T05:26:27.266Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T05:11:22.250Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T04:56:26.309Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T04:41:23.500Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T04:26:20.773Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T04:11:22.564Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T03:56:26.526Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-09T03:41:23.707Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T03:26:23.992Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T03:11:20.567Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T02:56:22.201Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T02:41:21.697Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T02:26:25.728Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T02:11:20.713Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-09T01:56:20.144Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-09T01:41:19.678Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-09T01:26:14.721Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-09T01:11:14.292Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-09T00:56:13.796Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-09T00:41:15.488Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-09T00:26:21.716Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-09T00:11:12.273Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-08T23:56:11.763Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-08T23:41:15.624Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-08T23:26:13.449Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-08T23:11:14.759Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-08T22:56:14.258Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-08T22:41:09.446Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-08T22:26:10.663Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T22:11:10.155Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-08T21:56:07.440Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-08T21:41:13.624Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-08T21:26:06.509Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-08T21:11:10.404Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-08T20:56:05.466Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-08T20:41:07.148Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T20:26:06.660Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T20:11:03.953Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T19:56:07.959Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T19:41:07.391Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-08T19:26:02.425Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-08T19:11:04.256Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-08T18:56:01.544Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-08T18:41:03.149Z"
      },
      {
          "temperature_c": 15,
          "humidity": 44,
          "datetime": "2025-01-08T18:26:00.506Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-08T18:10:59.973Z"
      },
      {
          "temperature_c": 15,
          "humidity": 43,
          "datetime": "2025-01-08T17:56:01.680Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T17:40:58.997Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T17:26:00.830Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T17:11:02.415Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T16:55:57.425Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T16:40:56.933Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T16:25:58.644Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-08T16:10:58.157Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T15:55:57.707Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T15:40:57.170Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T15:25:56.630Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T15:10:53.989Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T14:55:55.667Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T14:40:57.418Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T14:25:54.639Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T14:10:51.913Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T13:55:51.424Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T13:40:50.913Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T13:25:57.386Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T13:10:52.175Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T12:55:49.464Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-08T12:40:51.166Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-08T12:25:53.437Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T12:10:47.973Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T11:55:51.918Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T11:40:49.195Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T11:25:48.725Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T11:10:48.183Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-08T10:55:45.444Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-08T10:40:49.418Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-08T10:25:46.655Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-08T10:10:48.387Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T09:55:43.507Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T09:40:45.117Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-08T09:25:44.743Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-08T09:10:41.983Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-08T08:55:45.934Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-08T08:40:43.118Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-08T08:25:45.949Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-08T07:49:38.091Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-08T07:34:42.099Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-08T07:19:37.054Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-08T07:04:36.822Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T06:49:38.390Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T06:34:35.615Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T06:19:35.135Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T06:04:36.770Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T05:49:36.310Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T05:34:33.644Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T05:19:37.573Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T05:04:41.470Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-08T04:49:36.573Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T04:34:31.556Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T04:19:35.471Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-08T04:04:30.619Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-08T03:49:30.054Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-08T03:34:32.017Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-08T03:19:36.167Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-08T03:04:31.036Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-08T02:49:30.452Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-08T02:34:29.896Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-08T02:19:31.656Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-08T02:04:31.787Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-08T01:49:32.748Z"
      },
      {
          "temperature_c": 14,
          "humidity": 51,
          "datetime": "2025-01-08T01:34:27.754Z"
      },
      {
          "temperature_c": 14,
          "humidity": 51,
          "datetime": "2025-01-08T01:19:29.585Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-08T01:04:29.058Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-08T00:49:24.121Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-08T00:34:25.850Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-08T00:19:23.147Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-08T00:04:22.531Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-07T23:49:26.496Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-07T23:34:25.969Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T23:19:21.166Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T23:04:25.207Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T22:49:33.996Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T22:34:22.747Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T22:19:23.760Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T22:04:22.833Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T21:49:22.271Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-07T21:34:17.279Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-07T21:19:18.998Z"
      },
      {
          "temperature_c": 15,
          "humidity": 44,
          "datetime": "2025-01-07T21:04:17.451Z"
      },
      {
          "temperature_c": 15,
          "humidity": 44,
          "datetime": "2025-01-07T20:41:09.749Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T20:26:04.488Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T20:11:09.531Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T19:56:05.460Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-07T19:41:02.791Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T19:26:02.327Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T19:11:04.002Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T18:56:05.721Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-07T18:41:05.200Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T18:26:02.437Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T18:11:04.199Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T17:56:03.742Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T17:41:00.976Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T17:25:58.259Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T17:11:00.116Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T16:55:57.305Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T16:40:56.770Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T16:25:56.309Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T16:10:57.998Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T15:55:57.561Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T15:40:59.173Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T15:25:56.442Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T15:10:55.986Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-07T14:55:53.293Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-07T14:40:54.989Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-07T14:25:56.736Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-07T14:10:53.992Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-07T13:55:55.752Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-07T13:40:55.259Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-07T13:25:54.842Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-07T13:10:51.981Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-07T12:55:53.721Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T12:40:50.927Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T12:25:50.433Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T12:10:54.486Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T11:55:47.268Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T11:40:46.774Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T11:25:49.003Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T11:10:50.263Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T10:55:45.243Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T10:40:46.946Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T10:25:44.255Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T10:10:45.958Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T09:55:43.311Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T09:40:47.277Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T09:25:42.286Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T09:10:41.769Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T08:55:43.239Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T08:40:53.371Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T08:25:56.085Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T08:05:06.841Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T07:49:56.622Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T07:34:58.288Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T07:20:11.328Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T07:04:59.223Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T06:50:01.217Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T06:34:53.836Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T06:05:06.340Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T05:50:06.051Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T05:34:56.311Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T05:04:57.581Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T04:50:01.844Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T04:34:54.341Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T04:19:56.029Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T04:04:48.821Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T03:34:59.044Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T03:19:47.471Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T03:04:48.134Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T02:49:50.820Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-07T02:34:55.745Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-07T02:19:49.787Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-07T02:04:53.730Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-07T01:49:46.715Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-07T01:34:46.391Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-07T01:19:59.495Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-07T01:04:47.884Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-07T00:49:45.172Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T00:34:46.764Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-07T00:20:00.038Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-07T00:04:46.529Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T23:49:45.308Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T23:34:40.453Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T23:19:42.231Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T23:04:47.136Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T22:49:46.198Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T22:34:42.693Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T22:19:45.284Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T22:04:40.337Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T21:49:37.680Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T21:34:41.528Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T21:19:36.730Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T21:04:42.788Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T20:49:44.551Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T20:34:41.757Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T20:19:43.498Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T20:04:38.504Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T19:49:38.032Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T19:34:35.550Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T19:19:34.993Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T19:04:35.521Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-06T18:49:33.977Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-06T18:34:33.510Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-06T18:19:39.659Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-06T18:04:30.143Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-06T17:49:38.631Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-06T17:34:33.477Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-06T17:19:35.358Z"
      },
      {
          "temperature_c": 14,
          "humidity": 45,
          "datetime": "2025-01-06T17:04:34.815Z"
      },
      {
          "temperature_c": 14,
          "humidity": 46,
          "datetime": "2025-01-06T16:49:38.983Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-06T16:34:31.479Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-06T16:19:28.964Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-06T16:04:30.512Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-06T15:49:34.612Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-06T15:34:45.465Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-06T15:19:35.832Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-06T15:04:28.536Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-06T14:49:27.941Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-06T14:34:29.772Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T14:19:25.058Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T14:04:28.921Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T13:49:21.783Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T13:34:25.539Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T13:19:23.071Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T13:04:24.392Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T12:49:22.102Z"
      },
      {
          "temperature_c": 12,
          "humidity": 42,
          "datetime": "2025-01-06T12:34:23.434Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T12:19:18.644Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T12:04:20.955Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T11:49:17.639Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T11:34:35.095Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-06T11:19:18.952Z"
      },
      {
          "temperature_c": 13,
          "humidity": 41,
          "datetime": "2025-01-06T11:04:25.022Z"
      },
      {
          "temperature_c": 13,
          "humidity": 42,
          "datetime": "2025-01-06T10:49:22.288Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-06T10:34:19.513Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-06T10:19:18.953Z"
      },
      {
          "temperature_c": 13,
          "humidity": 54,
          "datetime": "2025-01-06T10:04:16.765Z"
      },
      {
          "temperature_c": 13,
          "humidity": 53,
          "datetime": "2025-01-06T09:49:16.583Z"
      },
      {
          "temperature_c": 14,
          "humidity": 52,
          "datetime": "2025-01-06T09:34:25.369Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-06T09:19:19.999Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-06T09:04:14.072Z"
      },
      {
          "temperature_c": 14,
          "humidity": 54,
          "datetime": "2025-01-06T00:42:54.631Z"
      },
      {
          "temperature_c": 14,
          "humidity": 55,
          "datetime": "2025-01-06T00:27:49.583Z"
      },
      {
          "temperature_c": 14,
          "humidity": 55,
          "datetime": "2025-01-06T00:12:49.147Z"
      },
      {
          "temperature_c": 14,
          "humidity": 55,
          "datetime": "2025-01-05T23:57:48.494Z"
      },
      {
          "temperature_c": 14,
          "humidity": 55,
          "datetime": "2025-01-05T23:42:50.320Z"
      },
      {
          "temperature_c": 14,
          "humidity": 55,
          "datetime": "2025-01-05T23:27:49.969Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-05T23:12:47.662Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-05T22:57:46.691Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-05T22:42:48.351Z"
      },
      {
          "temperature_c": 14,
          "humidity": 56,
          "datetime": "2025-01-05T22:27:46.026Z"
      },
      {
          "temperature_c": 14,
          "humidity": 56,
          "datetime": "2025-01-05T22:12:47.784Z"
      },
      {
          "temperature_c": 14,
          "humidity": 57,
          "datetime": "2025-01-05T21:57:44.972Z"
      },
      {
          "temperature_c": 14,
          "humidity": 57,
          "datetime": "2025-01-05T21:42:48.978Z"
      },
      {
          "temperature_c": 14,
          "humidity": 57,
          "datetime": "2025-01-05T21:27:43.972Z"
      },
      {
          "temperature_c": 14,
          "humidity": 57,
          "datetime": "2025-01-05T21:12:59.270Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-05T20:57:43.120Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-05T20:42:44.677Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T20:27:44.286Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T20:12:45.978Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-05T19:57:43.261Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-05T19:42:54.042Z"
      },
      {
          "temperature_c": 14,
          "humidity": 49,
          "datetime": "2025-01-05T19:27:42.289Z"
      },
      {
          "temperature_c": 14,
          "humidity": 51,
          "datetime": "2025-01-05T19:12:41.678Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-05T18:57:41.308Z"
      },
      {
          "temperature_c": 14,
          "humidity": 53,
          "datetime": "2025-01-05T18:42:45.362Z"
      },
      {
          "temperature_c": 14,
          "humidity": 52,
          "datetime": "2025-01-05T18:27:40.310Z"
      },
      {
          "temperature_c": 14,
          "humidity": 51,
          "datetime": "2025-01-05T18:12:41.986Z"
      },
      {
          "temperature_c": 14,
          "humidity": 51,
          "datetime": "2025-01-05T17:57:36.946Z"
      },
      {
          "temperature_c": 14,
          "humidity": 51,
          "datetime": "2025-01-05T17:42:52.217Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-05T17:27:36.057Z"
      },
      {
          "temperature_c": 14,
          "humidity": 50,
          "datetime": "2025-01-05T17:12:40.087Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T16:57:34.942Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T16:42:38.972Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T16:27:43.136Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-05T16:12:33.552Z"
      },
      {
          "temperature_c": 14,
          "humidity": 47,
          "datetime": "2025-01-05T15:57:33.276Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T15:42:32.464Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T15:27:31.967Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T15:12:38.200Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T14:57:35.461Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T14:42:35.067Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T14:27:32.243Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T14:12:29.498Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T13:57:28.827Z"
      },
      {
          "temperature_c": 14,
          "humidity": 48,
          "datetime": "2025-01-05T13:42:27.494Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-05T13:27:26.930Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T13:12:26.447Z"
      },
      {
          "temperature_c": 13,
          "humidity": 54,
          "datetime": "2025-01-05T12:57:25.967Z"
      },
      {
          "temperature_c": 13,
          "humidity": 53,
          "datetime": "2025-01-05T12:42:25.515Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-05T12:27:24.998Z"
      },
      {
          "temperature_c": 13,
          "humidity": 50,
          "datetime": "2025-01-05T12:12:26.690Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-05T11:57:23.950Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-05T11:42:23.474Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-05T11:27:22.959Z"
      },
      {
          "temperature_c": 13,
          "humidity": 47,
          "datetime": "2025-01-05T11:12:22.486Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-05T10:57:23.069Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-05T10:40:46.512Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T10:25:44.011Z"
      },
      {
          "temperature_c": 13,
          "humidity": 50,
          "datetime": "2025-01-05T10:10:43.736Z"
      },
      {
          "temperature_c": 13,
          "humidity": 50,
          "datetime": "2025-01-05T09:55:43.410Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T09:40:40.449Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T09:25:40.698Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T09:10:39.471Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T08:55:41.173Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T08:40:38.457Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T08:25:39.476Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T08:01:59.230Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T07:47:01.712Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T07:31:56.732Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T07:17:02.956Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T07:01:55.801Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T06:47:01.993Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T06:31:57.064Z"
      },
      {
          "temperature_c": 13,
          "humidity": 51,
          "datetime": "2025-01-05T06:16:58.733Z"
      },
      {
          "temperature_c": 13,
          "humidity": 49,
          "datetime": "2025-01-05T06:01:53.735Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-05T05:46:53.177Z"
      },
      {
          "temperature_c": 13,
          "humidity": 48,
          "datetime": "2025-01-05T05:31:54.914Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-05T05:16:52.146Z"
      },
      {
          "temperature_c": 13,
          "humidity": 46,
          "datetime": "2025-01-05T05:01:54.080Z"
      },
      {
          "temperature_c": 13,
          "humidity": 45,
          "datetime": "2025-01-05T04:46:55.736Z"
      },
      {
          "temperature_c": 13,
          "humidity": 44,
          "datetime": "2025-01-05T04:31:52.985Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-05T04:16:50.232Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-05T04:01:54.246Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-05T03:46:51.521Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-05T03:31:55.417Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-05T03:16:48.264Z"
      },
      {
          "temperature_c": 13,
          "humidity": 43,
          "datetime": "2025-01-05T03:01:52.078Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-05T02:46:49.452Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-05T02:31:53.352Z"
      },
      {
          "temperature_c": 14,
          "humidity": 43,
          "datetime": "2025-01-05T02:16:50.715Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T02:01:45.657Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T01:46:45.548Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T01:31:49.246Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T01:16:46.522Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T01:01:45.993Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T00:46:43.143Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T00:31:42.752Z"
      },
      {
          "temperature_c": 14,
          "humidity": 44,
          "datetime": "2025-01-05T00:16:42.331Z"
      }
  ],
  "weather": [
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.88,
          "temperature_apparent": -0.88,
          "uv_index": 0,
          "wind_speed": 1.13,
          "datetime": "2025-01-09T23:56:11.429Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.63,
          "temperature_apparent": -0.63,
          "uv_index": 0,
          "wind_speed": 1.31,
          "datetime": "2025-01-09T23:41:09.696Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-09T23:26:15.711Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.13,
          "temperature_apparent": -2.2,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-09T23:11:08.625Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -2.18,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-09T22:56:08.536Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.38,
          "temperature_apparent": -2.2,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-09T22:41:08.684Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-09T22:26:07.189Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-09T22:11:06.287Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-09T21:56:05.869Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-09T21:41:05.325Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.13,
          "temperature_apparent": -2.2,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-09T21:26:04.950Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -2.01,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-09T21:11:04.895Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-09T20:56:04.118Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -2.11,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-09T20:41:03.424Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -2.26,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-09T20:26:03.322Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -2.19,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-09T20:11:02.565Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -2.11,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-09T19:56:01.862Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-09T19:41:01.337Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -2.17,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-09T19:26:01.072Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.69,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-09T19:11:00.296Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.88,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-09T18:56:00.127Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -1.89,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-09T18:40:59.797Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.19,
          "temperature_apparent": -1.98,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-09T18:25:59.634Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -1.49,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-09T18:10:59.003Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -1.59,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-09T17:55:58.261Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.49,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T17:40:57.794Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.59,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T17:25:57.502Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -1.65,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-09T17:10:56.829Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.13,
          "temperature_apparent": -1.26,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T16:55:56.473Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -0.99,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T16:40:55.868Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.76,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T16:25:55.523Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.69,
          "temperature_apparent": -0.44,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T16:10:55.009Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.15,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T15:55:54.465Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.31,
          "temperature_apparent": 0.18,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T15:40:53.757Z"
      },
      {
          "humidity": 78,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.63,
          "temperature_apparent": 0.56,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T15:25:53.529Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.88,
          "temperature_apparent": 0.78,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-09T15:10:52.776Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": 0.85,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-09T14:55:52.310Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.13,
          "temperature_apparent": 0.96,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-09T14:40:51.795Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 0.96,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-09T14:25:51.485Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.31,
          "temperature_apparent": 1.11,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-09T14:10:50.958Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 1.03,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-09T13:55:50.346Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.13,
          "temperature_apparent": 1,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-09T13:40:49.854Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": 0.93,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-09T13:25:51.067Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.88,
          "temperature_apparent": 0.86,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T13:10:48.925Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.81,
          "temperature_apparent": 0.79,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T12:55:48.360Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.63,
          "temperature_apparent": 0.56,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T12:40:47.884Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.38,
          "temperature_apparent": 0.26,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T12:25:47.793Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.19,
          "temperature_apparent": 0.03,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T12:10:47.051Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.15,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T11:55:46.517Z"
      },
      {
          "humidity": 73,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.81,
          "temperature_apparent": -0.29,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T11:40:45.758Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.63,
          "temperature_apparent": -0.46,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-09T11:25:45.676Z"
      },
      {
          "humidity": 71,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -0.67,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-09T11:10:44.737Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2,
          "temperature_apparent": -1.01,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-09T10:55:44.343Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -1.41,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-09T10:40:43.969Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.19,
          "temperature_apparent": -1.81,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-09T10:25:44.628Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.81,
          "temperature_apparent": -2.2,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-09T10:10:42.870Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -2.67,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-09T09:55:42.421Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.13,
          "temperature_apparent": -2.99,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-09T09:40:41.802Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.63,
          "temperature_apparent": -3.43,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-09T09:25:41.328Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.13,
          "temperature_apparent": -3.78,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-09T09:10:40.831Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.38,
          "temperature_apparent": -4.07,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-09T08:55:40.725Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.63,
          "temperature_apparent": -4.2,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-09T08:40:43.678Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.88,
          "temperature_apparent": -4.4,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-09T08:25:40.800Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.31,
          "temperature_apparent": -4.71,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-09T07:56:28.503Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.31,
          "temperature_apparent": -4.71,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-09T07:41:28.456Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.38,
          "temperature_apparent": -4.69,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-09T07:26:27.332Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.5,
          "temperature_apparent": -4.83,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-09T07:11:27.391Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.5,
          "temperature_apparent": -4.83,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-09T06:56:26.311Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.5,
          "temperature_apparent": -4.93,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-09T06:41:26.112Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.5,
          "temperature_apparent": -5.12,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-09T06:26:25.355Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3.63,
          "temperature_apparent": -3.63,
          "uv_index": 0,
          "wind_speed": 1.13,
          "datetime": "2025-01-09T06:11:25.090Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3.5,
          "temperature_apparent": -3.5,
          "uv_index": 0,
          "wind_speed": 1.19,
          "datetime": "2025-01-09T05:56:24.366Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3.38,
          "temperature_apparent": -3.38,
          "uv_index": 0,
          "wind_speed": 1.31,
          "datetime": "2025-01-09T05:41:23.714Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3.31,
          "temperature_apparent": -3.31,
          "uv_index": 0,
          "wind_speed": 1.31,
          "datetime": "2025-01-09T05:26:23.369Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3.19,
          "temperature_apparent": -5.18,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-09T05:11:23.314Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3.13,
          "temperature_apparent": -5.55,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-09T04:56:22.353Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3,
          "temperature_apparent": -5.7,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-09T04:41:21.890Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -3,
          "temperature_apparent": -5.79,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-09T04:26:21.376Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.88,
          "temperature_apparent": -5.99,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-09T04:11:21.099Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.69,
          "temperature_apparent": -6,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-09T03:56:20.275Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.63,
          "temperature_apparent": -6.15,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-09T03:41:19.894Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.5,
          "temperature_apparent": -6.21,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-09T03:26:20.357Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.31,
          "temperature_apparent": -6.17,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-09T03:11:19.111Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 5,
          "rain_intensity": 0,
          "temperature": -2.31,
          "temperature_apparent": -6.41,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-09T02:56:18.439Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -2.19,
          "temperature_apparent": -6.32,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T02:41:18.021Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 5,
          "rain_intensity": 0,
          "temperature": -2.19,
          "temperature_apparent": -6.43,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T02:26:17.519Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 5,
          "rain_intensity": 0,
          "temperature": -2.13,
          "temperature_apparent": -6.41,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-09T02:11:17.063Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 5,
          "rain_intensity": 0,
          "temperature": -2,
          "temperature_apparent": -6.2,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T01:56:16.442Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.88,
          "temperature_apparent": -5.94,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T01:41:15.844Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.81,
          "temperature_apparent": -5.81,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-09T01:26:15.654Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.69,
          "temperature_apparent": -5.54,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-09T01:11:14.877Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.38,
          "temperature_apparent": -5.28,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-09T00:56:14.391Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.19,
          "temperature_apparent": -5.11,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T00:41:13.782Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -4.89,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-09T00:26:13.650Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.69,
          "temperature_apparent": -4.62,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-09T00:11:13.146Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.69,
          "temperature_apparent": -4.62,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-08T23:56:12.591Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.63,
          "temperature_apparent": -4.59,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-08T23:41:12.003Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -4.54,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T23:26:12.347Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.38,
          "temperature_apparent": -4.49,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T23:11:11.102Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -4.41,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T22:56:10.899Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -4.26,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T22:41:10.370Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.13,
          "temperature_apparent": -4.18,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T22:26:08.908Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -3.88,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T22:11:08.451Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -3.88,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T21:56:08.427Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -3.88,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T21:41:07.638Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -3.8,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-08T21:26:07.053Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -3.71,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T21:11:06.466Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -3.55,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T20:56:06.495Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -3.48,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T20:41:05.672Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -3.48,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T20:26:04.968Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -3.33,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T20:11:04.687Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 5,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -3.33,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T19:56:04.466Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -3.17,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T19:41:03.644Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -3.17,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T19:26:03.054Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 50,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -3.17,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T19:11:02.521Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 0.69,
          "temperature_apparent": -3.1,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T18:56:02.248Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 0.69,
          "temperature_apparent": -3.1,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T18:41:01.673Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 0.81,
          "temperature_apparent": -2.95,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T18:26:01.439Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 0.88,
          "temperature_apparent": -3.14,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-08T18:11:00.650Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1,
          "temperature_apparent": -2.99,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-08T17:55:59.909Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1,
          "temperature_apparent": -2.99,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-08T17:40:59.673Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1,
          "temperature_apparent": -2.95,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-08T17:25:59.254Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1,
          "temperature_apparent": -2.95,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-08T17:10:58.549Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -2.79,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-08T16:55:58.013Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -2.7,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-08T16:40:58.048Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1.19,
          "temperature_apparent": -2.63,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-08T16:25:56.869Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0,
          "temperature": 1.19,
          "temperature_apparent": -2.63,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-08T16:10:56.455Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.38,
          "temperature_apparent": -2.17,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-08T15:55:56.154Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -1.67,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-08T15:40:55.693Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -0.82,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-08T15:25:54.979Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -0.82,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-08T15:10:54.568Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.13,
          "temperature_apparent": -0.7,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-08T14:55:54.090Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -0.73,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T14:40:53.869Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -0.74,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-08T14:25:53.062Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.62,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-08T14:10:52.811Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.41,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-08T13:55:52.299Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.36,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T13:40:51.881Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.19,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-08T13:25:51.243Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.08,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-08T13:10:50.656Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -0.58,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T12:55:50.300Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.13,
          "temperature_apparent": -1.07,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-08T12:40:49.728Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -1.56,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-08T12:25:49.911Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.86,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-08T12:10:48.823Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.73,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-08T11:55:48.202Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.59,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-08T11:40:47.834Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.44,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-08T11:25:47.557Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.24,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-08T11:10:46.702Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -1.46,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-08T10:55:45.978Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -1.61,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-08T10:40:45.892Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.31,
          "temperature_apparent": -1.78,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T10:25:44.876Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.19,
          "temperature_apparent": -1.93,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T10:10:44.627Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1,
          "temperature_apparent": -2.15,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T09:55:44.044Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.88,
          "temperature_apparent": -2.3,
          "uv_index": 0,
          "wind_speed": 2.81,
          "datetime": "2025-01-08T09:40:43.338Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.69,
          "temperature_apparent": -2.41,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-08T09:25:43.518Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -2.63,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-08T09:10:42.497Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -2.57,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-08T08:55:41.945Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -2.32,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-08T08:40:41.391Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -2.4,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-08T08:25:42.291Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -2.19,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-08T08:04:39.506Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.87,
          "uv_index": 0,
          "wind_speed": 1.81,
          "datetime": "2025-01-08T07:49:38.761Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -1.75,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-08T07:34:38.721Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": 0.13,
          "uv_index": 0,
          "wind_speed": 1.31,
          "datetime": "2025-01-08T07:19:37.843Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0,
          "temperature_apparent": 0,
          "uv_index": 0,
          "wind_speed": 0.81,
          "datetime": "2025-01-08T07:04:37.481Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0,
          "temperature_apparent": 0,
          "uv_index": 0,
          "wind_speed": 0.81,
          "datetime": "2025-01-08T06:49:36.741Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.19,
          "temperature_apparent": -1.19,
          "uv_index": 0,
          "wind_speed": 0.81,
          "datetime": "2025-01-08T06:34:36.628Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1.31,
          "temperature_apparent": -1.31,
          "uv_index": 0,
          "wind_speed": 0.88,
          "datetime": "2025-01-08T06:19:35.985Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -1,
          "uv_index": 0,
          "wind_speed": 1,
          "datetime": "2025-01-08T06:04:35.117Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -1,
          "temperature_apparent": -1,
          "uv_index": 0,
          "wind_speed": 1,
          "datetime": "2025-01-08T05:49:34.849Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.81,
          "temperature_apparent": -0.81,
          "uv_index": 0,
          "wind_speed": 1.13,
          "datetime": "2025-01-08T05:34:34.769Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.5,
          "temperature_apparent": -0.5,
          "uv_index": 0,
          "wind_speed": 1.19,
          "datetime": "2025-01-08T05:19:33.826Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.31,
          "temperature_apparent": -0.31,
          "uv_index": 0,
          "wind_speed": 1.31,
          "datetime": "2025-01-08T05:04:33.085Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -1.78,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-08T04:49:33.074Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -1.78,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-08T04:34:32.678Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": -0.19,
          "temperature_apparent": -1.78,
          "uv_index": 0,
          "wind_speed": 1.38,
          "datetime": "2025-01-08T04:19:31.785Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0,
          "temperature_apparent": -1.96,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-08T04:04:31.440Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0,
          "temperature_apparent": -1.96,
          "uv_index": 0,
          "wind_speed": 1.63,
          "datetime": "2025-01-08T03:49:30.608Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -2.17,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-08T03:34:30.439Z"
      },
      {
          "humidity": 91,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -2.26,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-08T03:19:30.160Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -2.19,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-08T03:04:29.677Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -2.19,
          "uv_index": 0,
          "wind_speed": 2.13,
          "datetime": "2025-01-08T02:49:28.948Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -1.95,
          "uv_index": 0,
          "wind_speed": 1.88,
          "datetime": "2025-01-08T02:34:28.476Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -1.84,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-08T02:19:27.885Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.13,
          "temperature_apparent": -1.63,
          "uv_index": 0,
          "wind_speed": 1.5,
          "datetime": "2025-01-08T02:04:27.917Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.19,
          "temperature_apparent": -1.84,
          "uv_index": 0,
          "wind_speed": 1.69,
          "datetime": "2025-01-08T01:49:26.875Z"
      },
      {
          "humidity": 90,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.31,
          "temperature_apparent": -2.11,
          "uv_index": 0,
          "wind_speed": 2,
          "datetime": "2025-01-08T01:34:26.714Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.38,
          "temperature_apparent": -2.26,
          "uv_index": 0,
          "wind_speed": 2.19,
          "datetime": "2025-01-08T01:19:25.945Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.5,
          "temperature_apparent": -2.25,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-08T01:04:25.180Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.63,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 2.31,
          "datetime": "2025-01-08T00:49:24.727Z"
      },
      {
          "humidity": 89,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.69,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 2.38,
          "datetime": "2025-01-08T00:34:24.413Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.81,
          "temperature_apparent": -2.08,
          "uv_index": 0,
          "wind_speed": 2.5,
          "datetime": "2025-01-08T00:19:23.739Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.88,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-08T00:04:23.284Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 0.88,
          "temperature_apparent": -2.13,
          "uv_index": 0,
          "wind_speed": 2.63,
          "datetime": "2025-01-07T23:49:22.628Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -1.89,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-07T23:34:22.086Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.13,
          "temperature_apparent": -1.89,
          "uv_index": 0,
          "wind_speed": 2.69,
          "datetime": "2025-01-07T23:19:22.027Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.31,
          "temperature_apparent": -1.83,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T23:04:21.515Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.38,
          "temperature_apparent": -1.87,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-07T22:49:26.226Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.38,
          "temperature_apparent": -1.87,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-07T22:34:21.464Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -1.82,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-07T22:19:19.906Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -1.82,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-07T22:04:19.112Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -1.82,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-07T21:49:18.457Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -1.67,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-07T21:34:17.861Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -1.67,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-07T21:19:17.424Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -1.67,
          "uv_index": 0,
          "wind_speed": 3.13,
          "datetime": "2025-01-07T21:04:18.079Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -1.49,
          "uv_index": 0,
          "wind_speed": 3,
          "datetime": "2025-01-07T20:41:06.166Z"
      },
      {
          "humidity": 88,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.24,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T20:26:05.349Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.24,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T20:11:05.734Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.24,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T19:56:03.749Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -1.16,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T19:41:03.663Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -1.16,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T19:26:02.895Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2,
          "temperature_apparent": -1.01,
          "uv_index": 0,
          "wind_speed": 2.88,
          "datetime": "2025-01-07T19:11:02.199Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.8,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T18:56:02.014Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -0.8,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T18:41:01.317Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.69,
          "temperature_apparent": -0.58,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T18:26:00.937Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.69,
          "temperature_apparent": -0.58,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T18:11:00.474Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.81,
          "temperature_apparent": -0.43,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T17:55:59.972Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -0.35,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T17:40:59.232Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": 0,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-07T17:25:58.782Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": 0,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-07T17:10:58.894Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.38,
          "temperature_apparent": 0.3,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-07T16:55:57.935Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.69,
          "temperature_apparent": 0.63,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T16:40:57.639Z"
      },
      {
          "humidity": 78,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.88,
          "temperature_apparent": 0.86,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-07T16:25:56.931Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 1.16,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-07T16:10:56.591Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.38,
          "temperature_apparent": 1.3,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-07T15:55:56.458Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.69,
          "temperature_apparent": 4.69,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-07T15:40:55.195Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.88,
          "temperature_apparent": 4.88,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-07T15:25:54.937Z"
      },
      {
          "humidity": 73,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.19,
          "temperature_apparent": 5.19,
          "uv_index": 0,
          "wind_speed": 4.13,
          "datetime": "2025-01-07T15:10:54.470Z"
      },
      {
          "humidity": 73,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.31,
          "temperature_apparent": 5.31,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-07T14:55:53.819Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.38,
          "temperature_apparent": 5.38,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2025-01-07T14:40:53.193Z"
      },
      {
          "humidity": 71,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.38,
          "temperature_apparent": 5.38,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T14:25:52.853Z"
      },
      {
          "humidity": 70,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.5,
          "temperature_apparent": 5.5,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-07T14:10:52.566Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.38,
          "temperature_apparent": 5.38,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T13:55:51.775Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.38,
          "temperature_apparent": 5.38,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T13:40:51.440Z"
      },
      {
          "humidity": 73,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.38,
          "temperature_apparent": 5.38,
          "uv_index": 0,
          "wind_speed": 5,
          "datetime": "2025-01-07T13:25:51.044Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.31,
          "temperature_apparent": 5.31,
          "uv_index": 0,
          "wind_speed": 5.19,
          "datetime": "2025-01-07T13:10:50.270Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.19,
          "temperature_apparent": 5.19,
          "uv_index": 0,
          "wind_speed": 5.13,
          "datetime": "2025-01-07T12:55:50.014Z"
      },
      {
          "humidity": 78,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5,
          "temperature_apparent": 5,
          "uv_index": 0,
          "wind_speed": 5,
          "datetime": "2025-01-07T12:40:49.260Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.88,
          "temperature_apparent": 4.88,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T12:25:48.793Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.88,
          "temperature_apparent": 4.88,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T12:10:48.190Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.81,
          "temperature_apparent": 4.81,
          "uv_index": 0,
          "wind_speed": 5,
          "datetime": "2025-01-07T11:55:48.325Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.69,
          "temperature_apparent": 4.69,
          "uv_index": 0,
          "wind_speed": 5.19,
          "datetime": "2025-01-07T11:40:47.657Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.63,
          "temperature_apparent": 4.63,
          "uv_index": 0,
          "wind_speed": 5.31,
          "datetime": "2025-01-07T11:25:47.540Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.5,
          "temperature_apparent": 4.5,
          "uv_index": 0,
          "wind_speed": 5.5,
          "datetime": "2025-01-07T11:10:46.456Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.31,
          "temperature_apparent": 0.16,
          "uv_index": 0,
          "wind_speed": 5.63,
          "datetime": "2025-01-07T10:55:46.336Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": -0.26,
          "uv_index": 0,
          "wind_speed": 5.69,
          "datetime": "2025-01-07T10:40:45.432Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.81,
          "temperature_apparent": -0.55,
          "uv_index": 0,
          "wind_speed": 5.81,
          "datetime": "2025-01-07T10:25:45.140Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.63,
          "temperature_apparent": -0.82,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-07T10:10:44.475Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": -1.22,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-07T09:55:44.182Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": -1.22,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-07T09:40:43.475Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.81,
          "temperature_apparent": -1.48,
          "uv_index": 0,
          "wind_speed": 5.13,
          "datetime": "2025-01-07T09:25:42.905Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -1.74,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T09:10:42.646Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -1.74,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T08:55:44.931Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -1.71,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-07T08:40:42.903Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.5,
          "temperature_apparent": -1.71,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-07T08:25:43.884Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.69,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T08:04:59.279Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.69,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T07:49:57.885Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -1.58,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-07T07:34:56.666Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.53,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-07T07:19:56.227Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.13,
          "temperature_apparent": -1.44,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-07T07:04:55.701Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-07T06:49:55.551Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-07T06:34:54.881Z"
      },
      {
          "humidity": 87,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -2.38,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-07T06:19:54.270Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.31,
          "temperature_apparent": -2.43,
          "uv_index": 0,
          "wind_speed": 3.63,
          "datetime": "2025-01-07T06:04:53.490Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 25,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -2.18,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-07T05:49:53.369Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 5,
          "rain_intensity": 0,
          "temperature": 1.69,
          "temperature_apparent": -2.1,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-07T05:34:52.768Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -1.99,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-07T05:19:52.185Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -2.08,
          "uv_index": 0,
          "wind_speed": 4.13,
          "datetime": "2025-01-07T05:04:51.879Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -2.08,
          "uv_index": 0,
          "wind_speed": 4.13,
          "datetime": "2025-01-07T04:49:51.659Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2,
          "temperature_apparent": -2.04,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-07T04:34:50.851Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.92,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T04:19:50.126Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -1.87,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-07T04:04:49.637Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -2.03,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-07T03:49:49.674Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -2.03,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-07T03:34:48.554Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -2.03,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-07T03:19:48.486Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.92,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T03:04:48.790Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.92,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T02:49:47.581Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.81,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-07T02:34:47.753Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.73,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-07T02:19:46.338Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.81,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-07T02:04:45.802Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.85,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2025-01-07T01:49:45.157Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.85,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2025-01-07T01:34:44.779Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.92,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-07T01:19:44.390Z"
      },
      {
          "humidity": 78,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.19,
          "temperature_apparent": -1.99,
          "uv_index": 0,
          "wind_speed": 4.63,
          "datetime": "2025-01-07T01:04:44.234Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.86,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-07T00:49:43.950Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.86,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-07T00:34:43.346Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.9,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T00:19:42.640Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.9,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-07T00:04:43.212Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.63,
          "temperature_apparent": -1.55,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-06T23:49:42.128Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.63,
          "temperature_apparent": -1.55,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-06T23:34:41.489Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.63,
          "temperature_apparent": -1.55,
          "uv_index": 0,
          "wind_speed": 4.81,
          "datetime": "2025-01-06T23:19:40.661Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.69,
          "temperature_apparent": -1.41,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-06T23:04:43.127Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.81,
          "temperature_apparent": -1.22,
          "uv_index": 0,
          "wind_speed": 4.63,
          "datetime": "2025-01-06T22:49:41.021Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.81,
          "temperature_apparent": -1.15,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-06T22:34:38.855Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -1,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2025-01-06T22:19:39.381Z"
      },
      {
          "humidity": 86,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -0.96,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-06T22:04:38.911Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -0.89,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T21:49:39.265Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -0.77,
          "uv_index": 0,
          "wind_speed": 4,
          "datetime": "2025-01-06T21:34:37.995Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -0.69,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-06T21:19:37.823Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.88,
          "temperature_apparent": -0.85,
          "uv_index": 0,
          "wind_speed": 4.13,
          "datetime": "2025-01-06T21:04:36.910Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.73,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T20:49:36.839Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.84,
          "uv_index": 0,
          "wind_speed": 4.38,
          "datetime": "2025-01-06T20:34:35.844Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.91,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-06T20:19:35.413Z"
      },
      {
          "humidity": 85,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.81,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-06T20:04:35.073Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": -0.54,
          "uv_index": 0,
          "wind_speed": 4.13,
          "datetime": "2025-01-06T19:49:34.379Z"
      },
      {
          "humidity": 84,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": -0.38,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-06T19:34:33.898Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.13,
          "temperature_apparent": -0.26,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-06T19:19:33.522Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.31,
          "temperature_apparent": -0.12,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-06T19:04:34.560Z"
      },
      {
          "humidity": 83,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.31,
          "temperature_apparent": -0.12,
          "uv_index": 0,
          "wind_speed": 3.81,
          "datetime": "2025-01-06T18:49:34.343Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.38,
          "temperature_apparent": -0.08,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-06T18:34:31.906Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.81,
          "temperature_apparent": 0.2,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-06T18:19:31.617Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": 0.5,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T18:04:31.217Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": 0.5,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T17:49:30.370Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4,
          "temperature_apparent": 0.5,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T17:34:30.050Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.13,
          "temperature_apparent": 0.65,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T17:19:29.604Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.19,
          "temperature_apparent": 0.73,
          "uv_index": 0,
          "wind_speed": 4.19,
          "datetime": "2025-01-06T17:04:29.066Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.38,
          "temperature_apparent": 0.89,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-06T16:49:28.502Z"
      },
      {
          "humidity": 78,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.5,
          "temperature_apparent": 4.5,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-06T16:34:28.466Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.88,
          "temperature_apparent": 4.88,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-06T16:19:27.318Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 15,
          "rain_intensity": 1.54,
          "temperature": 4.88,
          "temperature_apparent": 4.88,
          "uv_index": 0,
          "wind_speed": 4.5,
          "datetime": "2025-01-06T16:04:26.779Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.13,
          "temperature_apparent": 5.13,
          "uv_index": 0,
          "wind_speed": 4.63,
          "datetime": "2025-01-06T15:49:26.456Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.31,
          "temperature_apparent": 5.31,
          "uv_index": 0,
          "wind_speed": 4.63,
          "datetime": "2025-01-06T15:34:26.161Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.69,
          "temperature_apparent": 5.69,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-06T15:19:25.586Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.69,
          "temperature_apparent": 5.69,
          "uv_index": 0,
          "wind_speed": 4.69,
          "datetime": "2025-01-06T15:04:25.108Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.81,
          "temperature_apparent": 5.81,
          "uv_index": 0,
          "wind_speed": 5,
          "datetime": "2025-01-06T14:49:24.235Z"
      },
      {
          "humidity": 73,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.88,
          "temperature_apparent": 5.88,
          "uv_index": 0,
          "wind_speed": 5.31,
          "datetime": "2025-01-06T14:34:24.211Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 6,
          "temperature_apparent": 6,
          "uv_index": 0,
          "wind_speed": 5.63,
          "datetime": "2025-01-06T14:19:23.400Z"
      },
      {
          "humidity": 71,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 6.19,
          "temperature_apparent": 6.19,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-06T14:04:23.294Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 5,
          "rain_intensity": 0.13,
          "temperature": 6.13,
          "temperature_apparent": 6.13,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-06T13:49:22.879Z"
      },
      {
          "humidity": 72,
          "precipitation_probability": 5,
          "rain_intensity": 0.21,
          "temperature": 6,
          "temperature_apparent": 6,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-06T13:34:22.242Z"
      },
      {
          "humidity": 73,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.88,
          "temperature_apparent": 5.88,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-06T13:19:21.382Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.81,
          "temperature_apparent": 5.81,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-06T13:04:20.792Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.88,
          "temperature_apparent": 5.88,
          "uv_index": 0,
          "wind_speed": 6,
          "datetime": "2025-01-06T12:49:20.581Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.88,
          "temperature_apparent": 5.88,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-06T12:34:20.276Z"
      },
      {
          "humidity": 74,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.88,
          "temperature_apparent": 5.88,
          "uv_index": 0,
          "wind_speed": 6.31,
          "datetime": "2025-01-06T12:19:19.609Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.81,
          "temperature_apparent": 5.81,
          "uv_index": 0,
          "wind_speed": 6.38,
          "datetime": "2025-01-06T12:04:19.347Z"
      },
      {
          "humidity": 75,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.81,
          "temperature_apparent": 5.81,
          "uv_index": 0,
          "wind_speed": 6.38,
          "datetime": "2025-01-06T11:49:18.879Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.63,
          "temperature_apparent": 5.63,
          "uv_index": 0,
          "wind_speed": 6.63,
          "datetime": "2025-01-06T11:34:18.243Z"
      },
      {
          "humidity": 76,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.63,
          "temperature_apparent": 5.63,
          "uv_index": 0,
          "wind_speed": 6.63,
          "datetime": "2025-01-06T11:19:17.252Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.5,
          "temperature_apparent": 5.5,
          "uv_index": 0,
          "wind_speed": 6.69,
          "datetime": "2025-01-06T11:04:17.035Z"
      },
      {
          "humidity": 77,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.31,
          "temperature_apparent": 5.31,
          "uv_index": 0,
          "wind_speed": 6.63,
          "datetime": "2025-01-06T10:49:16.506Z"
      },
      {
          "humidity": 78,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.13,
          "temperature_apparent": 5.13,
          "uv_index": 0,
          "wind_speed": 6.63,
          "datetime": "2025-01-06T10:34:16.091Z"
      },
      {
          "humidity": 79,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5,
          "temperature_apparent": 5,
          "uv_index": 0,
          "wind_speed": 6.63,
          "datetime": "2025-01-06T10:19:15.353Z"
      },
      {
          "humidity": 80,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.81,
          "temperature_apparent": 4.81,
          "uv_index": 0,
          "wind_speed": 6.63,
          "datetime": "2025-01-06T10:04:15.158Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.69,
          "temperature_apparent": 4.69,
          "uv_index": 0,
          "wind_speed": 6.5,
          "datetime": "2025-01-06T09:49:14.893Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.69,
          "temperature_apparent": 4.69,
          "uv_index": 0,
          "wind_speed": 6.5,
          "datetime": "2025-01-06T09:34:14.904Z"
      },
      {
          "humidity": 81,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.63,
          "temperature_apparent": 4.63,
          "uv_index": 0,
          "wind_speed": 6.38,
          "datetime": "2025-01-06T09:19:17.712Z"
      },
      {
          "humidity": 82,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.63,
          "temperature_apparent": 4.63,
          "uv_index": 0,
          "wind_speed": 6.38,
          "datetime": "2025-01-06T09:04:15.321Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.63,
          "temperature_apparent": 11.63,
          "uv_index": 0,
          "wind_speed": 8.63,
          "datetime": "2025-01-06T00:44:01.566Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.63,
          "temperature_apparent": 11.63,
          "uv_index": 0,
          "wind_speed": 8.38,
          "datetime": "2025-01-06T00:29:00.801Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.69,
          "temperature_apparent": 11.69,
          "uv_index": 0,
          "wind_speed": 8.19,
          "datetime": "2025-01-06T00:14:00.514Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.69,
          "temperature_apparent": 11.69,
          "uv_index": 0,
          "wind_speed": 8.31,
          "datetime": "2025-01-05T23:59:00.164Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.81,
          "temperature_apparent": 11.81,
          "uv_index": 0,
          "wind_speed": 8.5,
          "datetime": "2025-01-05T23:43:59.653Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.81,
          "temperature_apparent": 11.81,
          "uv_index": 0,
          "wind_speed": 8.63,
          "datetime": "2025-01-05T23:28:58.808Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.69,
          "datetime": "2025-01-05T23:13:58.655Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 75,
          "rain_intensity": 0.24,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.63,
          "datetime": "2025-01-05T22:58:58.075Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 5,
          "rain_intensity": 1.77,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.5,
          "datetime": "2025-01-05T22:43:57.561Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 100,
          "rain_intensity": 2.26,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.38,
          "datetime": "2025-01-05T22:28:57.343Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 100,
          "rain_intensity": 0.73,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.31,
          "datetime": "2025-01-05T22:13:57.002Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 100,
          "rain_intensity": 1.1,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.38,
          "datetime": "2025-01-05T21:58:56.492Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 75,
          "rain_intensity": 0.47,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.5,
          "datetime": "2025-01-05T21:43:56.102Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 5,
          "rain_intensity": 1.15,
          "temperature": 12,
          "temperature_apparent": 12,
          "uv_index": 0,
          "wind_speed": 8.63,
          "datetime": "2025-01-05T21:28:55.501Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 75,
          "rain_intensity": 7.62,
          "temperature": 12,
          "temperature_apparent": 12,
          "uv_index": 0,
          "wind_speed": 8.69,
          "datetime": "2025-01-05T21:13:54.944Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12.13,
          "temperature_apparent": 12.13,
          "uv_index": 0,
          "wind_speed": 8.88,
          "datetime": "2025-01-05T20:58:54.736Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12.13,
          "temperature_apparent": 12.13,
          "uv_index": 0,
          "wind_speed": 9,
          "datetime": "2025-01-05T20:43:54.047Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 5,
          "rain_intensity": 0.21,
          "temperature": 12.19,
          "temperature_apparent": 12.19,
          "uv_index": 0,
          "wind_speed": 9.13,
          "datetime": "2025-01-05T20:28:53.263Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 5,
          "rain_intensity": 0.18,
          "temperature": 12.31,
          "temperature_apparent": 12.31,
          "uv_index": 0,
          "wind_speed": 9.19,
          "datetime": "2025-01-05T20:13:52.714Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12.19,
          "temperature_apparent": 12.19,
          "uv_index": 0,
          "wind_speed": 9.19,
          "datetime": "2025-01-05T19:58:52.471Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12.19,
          "temperature_apparent": 12.19,
          "uv_index": 0,
          "wind_speed": 9.13,
          "datetime": "2025-01-05T19:43:51.797Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12.13,
          "temperature_apparent": 12.13,
          "uv_index": 0,
          "wind_speed": 9.13,
          "datetime": "2025-01-05T19:28:51.363Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12.13,
          "temperature_apparent": 12.13,
          "uv_index": 0,
          "wind_speed": 9.13,
          "datetime": "2025-01-05T19:13:50.984Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12,
          "temperature_apparent": 12,
          "uv_index": 0,
          "wind_speed": 8.81,
          "datetime": "2025-01-05T18:58:50.175Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12,
          "temperature_apparent": 12,
          "uv_index": 0,
          "wind_speed": 8.5,
          "datetime": "2025-01-05T18:43:49.820Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.19,
          "datetime": "2025-01-05T18:28:49.320Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.31,
          "datetime": "2025-01-05T18:13:49.119Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.19,
          "datetime": "2025-01-05T17:58:48.621Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8.13,
          "datetime": "2025-01-05T17:43:47.804Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 8,
          "datetime": "2025-01-05T17:28:47.489Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.88,
          "datetime": "2025-01-05T17:13:46.805Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.81,
          "datetime": "2025-01-05T16:58:46.583Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.69,
          "datetime": "2025-01-05T16:43:45.772Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.63,
          "datetime": "2025-01-05T16:28:45.518Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.5,
          "datetime": "2025-01-05T16:13:45.035Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.38,
          "datetime": "2025-01-05T15:58:44.628Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 7.19,
          "datetime": "2025-01-05T15:43:43.993Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12,
          "temperature_apparent": 12,
          "uv_index": 0,
          "wind_speed": 7,
          "datetime": "2025-01-05T15:28:43.479Z"
      },
      {
          "humidity": 92,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 12,
          "temperature_apparent": 12,
          "uv_index": 0,
          "wind_speed": 6.88,
          "datetime": "2025-01-05T15:13:42.826Z"
      },
      {
          "humidity": 93,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.88,
          "temperature_apparent": 11.88,
          "uv_index": 0,
          "wind_speed": 6.81,
          "datetime": "2025-01-05T14:58:42.671Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.81,
          "temperature_apparent": 11.81,
          "uv_index": 0,
          "wind_speed": 6.81,
          "datetime": "2025-01-05T14:43:42.058Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.81,
          "temperature_apparent": 11.81,
          "uv_index": 0,
          "wind_speed": 6.69,
          "datetime": "2025-01-05T14:28:41.430Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.69,
          "temperature_apparent": 11.69,
          "uv_index": 0,
          "wind_speed": 6.69,
          "datetime": "2025-01-05T14:13:40.790Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.38,
          "temperature_apparent": 11.38,
          "uv_index": 0,
          "wind_speed": 6.5,
          "datetime": "2025-01-05T13:58:39.313Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11.19,
          "temperature_apparent": 11.19,
          "uv_index": 0,
          "wind_speed": 6.31,
          "datetime": "2025-01-05T13:43:38.510Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 11,
          "temperature_apparent": 11,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T13:28:37.908Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10.81,
          "temperature_apparent": 10.81,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-05T13:13:37.452Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10.63,
          "temperature_apparent": 10.63,
          "uv_index": 0,
          "wind_speed": 5.69,
          "datetime": "2025-01-05T12:58:37.384Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 5,
          "rain_intensity": 0.72,
          "temperature": 10.38,
          "temperature_apparent": 10.38,
          "uv_index": 0,
          "wind_speed": 5.5,
          "datetime": "2025-01-05T12:43:36.661Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10.19,
          "temperature_apparent": 10.19,
          "uv_index": 0,
          "wind_speed": 5.31,
          "datetime": "2025-01-05T12:28:36.004Z"
      },
      {
          "humidity": 99,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10,
          "temperature_apparent": 10,
          "uv_index": 0,
          "wind_speed": 5.13,
          "datetime": "2025-01-05T12:13:35.497Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 25,
          "rain_intensity": 0.16,
          "temperature": 10,
          "temperature_apparent": 10,
          "uv_index": 0,
          "wind_speed": 5.31,
          "datetime": "2025-01-05T11:58:35.276Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10,
          "temperature_apparent": 10,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-05T11:43:34.677Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10,
          "temperature_apparent": 10,
          "uv_index": 0,
          "wind_speed": 5.5,
          "datetime": "2025-01-05T11:28:34.177Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 10,
          "temperature_apparent": 10,
          "uv_index": 0,
          "wind_speed": 5.63,
          "datetime": "2025-01-05T11:13:33.471Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 100,
          "rain_intensity": 0.53,
          "temperature": 9.88,
          "temperature_apparent": 9.88,
          "uv_index": 0,
          "wind_speed": 5.5,
          "datetime": "2025-01-05T10:58:33.322Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 100,
          "rain_intensity": 1.53,
          "temperature": 9.88,
          "temperature_apparent": 9.88,
          "uv_index": 0,
          "wind_speed": 5.5,
          "datetime": "2025-01-05T10:40:42.744Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 100,
          "rain_intensity": 2.46,
          "temperature": 9.81,
          "temperature_apparent": 9.81,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-05T10:25:42.298Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 100,
          "rain_intensity": 2.24,
          "temperature": 9.69,
          "temperature_apparent": 9.69,
          "uv_index": 0,
          "wind_speed": 5.31,
          "datetime": "2025-01-05T10:10:42.020Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 75,
          "rain_intensity": 0.46,
          "temperature": 9.69,
          "temperature_apparent": 9.69,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-05T09:55:42.094Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 5,
          "rain_intensity": 0.15,
          "temperature": 9.63,
          "temperature_apparent": 9.63,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-05T09:40:40.989Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 9.5,
          "temperature_apparent": 9.5,
          "uv_index": 0,
          "wind_speed": 5.5,
          "datetime": "2025-01-05T09:25:41.595Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 100,
          "rain_intensity": 0.94,
          "temperature": 9.5,
          "temperature_apparent": 9.5,
          "uv_index": 0,
          "wind_speed": 5.63,
          "datetime": "2025-01-05T09:10:40.320Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 100,
          "rain_intensity": 2.84,
          "temperature": 9.5,
          "temperature_apparent": 9.5,
          "uv_index": 0,
          "wind_speed": 5.81,
          "datetime": "2025-01-05T08:55:39.434Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 100,
          "rain_intensity": 2.71,
          "temperature": 9.5,
          "temperature_apparent": 9.5,
          "uv_index": 0,
          "wind_speed": 6,
          "datetime": "2025-01-05T08:40:39.056Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 100,
          "rain_intensity": 1.48,
          "temperature": 9.63,
          "temperature_apparent": 9.63,
          "uv_index": 0,
          "wind_speed": 6.19,
          "datetime": "2025-01-05T08:25:39.979Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 9.5,
          "temperature_apparent": 9.5,
          "uv_index": 0,
          "wind_speed": 6.31,
          "datetime": "2025-01-05T08:02:00.325Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 9.38,
          "temperature_apparent": 9.38,
          "uv_index": 0,
          "wind_speed": 6.31,
          "datetime": "2025-01-05T07:46:58.317Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 9.31,
          "temperature_apparent": 9.31,
          "uv_index": 0,
          "wind_speed": 6.31,
          "datetime": "2025-01-05T07:31:57.603Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 5,
          "rain_intensity": 0.22,
          "temperature": 9.19,
          "temperature_apparent": 9.19,
          "uv_index": 0,
          "wind_speed": 6.31,
          "datetime": "2025-01-05T07:16:56.942Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 65,
          "rain_intensity": 0.22,
          "temperature": 8.88,
          "temperature_apparent": 8.88,
          "uv_index": 0,
          "wind_speed": 6.19,
          "datetime": "2025-01-05T07:01:56.636Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 8.63,
          "temperature_apparent": 8.63,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T06:46:56.204Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 8.31,
          "temperature_apparent": 8.31,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-05T06:31:55.610Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 5,
          "rain_intensity": 0.12,
          "temperature": 6.38,
          "temperature_apparent": 6.38,
          "uv_index": 0,
          "wind_speed": 3.69,
          "datetime": "2025-01-05T06:16:54.809Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.88,
          "temperature_apparent": 5.88,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-05T06:01:54.235Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 5.38,
          "temperature_apparent": 5.38,
          "uv_index": 0,
          "wind_speed": 3.38,
          "datetime": "2025-01-05T05:46:54.096Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.81,
          "temperature_apparent": 4.81,
          "uv_index": 0,
          "wind_speed": 3.31,
          "datetime": "2025-01-05T05:31:53.764Z"
      },
      {
          "humidity": 99,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 4.31,
          "temperature_apparent": 1.52,
          "uv_index": 0,
          "wind_speed": 3.19,
          "datetime": "2025-01-05T05:16:53.176Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.88,
          "temperature_apparent": 0.78,
          "uv_index": 0,
          "wind_speed": 3.5,
          "datetime": "2025-01-05T05:01:52.576Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3.5,
          "temperature_apparent": 0.07,
          "uv_index": 0,
          "wind_speed": 3.88,
          "datetime": "2025-01-05T04:46:52.278Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 3,
          "temperature_apparent": -0.81,
          "uv_index": 0,
          "wind_speed": 4.31,
          "datetime": "2025-01-05T04:31:51.794Z"
      },
      {
          "humidity": 98,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.63,
          "temperature_apparent": -1.45,
          "uv_index": 0,
          "wind_speed": 4.63,
          "datetime": "2025-01-05T04:16:50.800Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.38,
          "temperature_apparent": -1.9,
          "uv_index": 0,
          "wind_speed": 4.88,
          "datetime": "2025-01-05T04:01:50.583Z"
      },
      {
          "humidity": 97,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.31,
          "temperature_apparent": -2.11,
          "uv_index": 0,
          "wind_speed": 5.13,
          "datetime": "2025-01-05T03:46:50.011Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2.13,
          "temperature_apparent": -2.47,
          "uv_index": 0,
          "wind_speed": 5.38,
          "datetime": "2025-01-05T03:31:49.818Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 2,
          "temperature_apparent": -2.75,
          "uv_index": 0,
          "wind_speed": 5.63,
          "datetime": "2025-01-05T03:16:48.895Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.88,
          "temperature_apparent": -2.94,
          "uv_index": 0,
          "wind_speed": 5.69,
          "datetime": "2025-01-05T03:01:48.286Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.81,
          "temperature_apparent": -3.11,
          "uv_index": 0,
          "wind_speed": 5.88,
          "datetime": "2025-01-05T02:46:48.065Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 50,
          "rain_intensity": 0.58,
          "temperature": 1.69,
          "temperature_apparent": -3.33,
          "uv_index": 0,
          "wind_speed": 6,
          "datetime": "2025-01-05T02:31:47.225Z"
      },
      {
          "humidity": 96,
          "precipitation_probability": 100,
          "rain_intensity": 1.33,
          "temperature": 1.63,
          "temperature_apparent": -3.47,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T02:16:46.938Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 75,
          "rain_intensity": 0.92,
          "temperature": 1.63,
          "temperature_apparent": -3.47,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T02:01:46.331Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -3.47,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T01:46:46.256Z"
      },
      {
          "humidity": 95,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -3.47,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T01:31:45.460Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.63,
          "temperature_apparent": -3.41,
          "uv_index": 0,
          "wind_speed": 6,
          "datetime": "2025-01-05T01:16:45.014Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -3.62,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T01:01:44.483Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 0,
          "rain_intensity": 0,
          "temperature": 1.5,
          "temperature_apparent": -3.62,
          "uv_index": 0,
          "wind_speed": 6.13,
          "datetime": "2025-01-05T00:46:43.941Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 0.92,
          "temperature": 1.5,
          "temperature_apparent": -3.65,
          "uv_index": 0,
          "wind_speed": 6.19,
          "datetime": "2025-01-05T00:31:43.659Z"
      },
      {
          "humidity": 94,
          "precipitation_probability": 100,
          "rain_intensity": 3.64,
          "temperature": 1.5,
          "temperature_apparent": -3.65,
          "uv_index": 0,
          "wind_speed": 6.19,
          "datetime": "2025-01-05T00:16:43.153Z"
      }
  ],
  "surf": [
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T08:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 4.19153,
          "max_wave_size": 4.67056,
          "swell_period": 13,
          "wind_speed": 13.13108,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 18.590690429241363,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T17:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.63468,
          "max_wave_size": 3.87218,
          "swell_period": 13,
          "wind_speed": 14.14408,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.762349355614276,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T16:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.71452,
          "max_wave_size": 3.95202,
          "swell_period": 13,
          "wind_speed": 14.52034,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.684773546479985,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T15:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.83427,
          "max_wave_size": 4.03185,
          "swell_period": 13,
          "wind_speed": 13.34075,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.586369270184456,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T14:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.91411,
          "max_wave_size": 4.11169,
          "swell_period": 13,
          "wind_speed": 12.048,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.50879346105016,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T13:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.99395,
          "max_wave_size": 4.23145,
          "swell_period": 13,
          "wind_speed": 11.1491,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.41326793091892,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T12:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 3.87218,
          "max_wave_size": 4.31129,
          "swell_period": 13,
          "wind_speed": 11.37523,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 18.91893367036652,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T11:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 3.99193,
          "max_wave_size": 4.39113,
          "swell_period": 13,
          "wind_speed": 9.96103,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 18.820524897647893,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T10:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 4.03185,
          "max_wave_size": 4.47097,
          "swell_period": 13,
          "wind_speed": 10.59533,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 18.7637872720838,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Putsborough",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T09:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 4.11169,
          "max_wave_size": 4.59072,
          "swell_period": 13,
          "wind_speed": 11.78147,
          "dawn": "2025-01-12T07:39:14.000Z",
          "sunrise": "2025-01-12T08:17:42.000Z",
          "sunset": "2025-01-12T16:34:53.000Z",
          "dusk": "2025-01-12T17:13:21.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 18.668266238375658,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T17:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.91305,
          "max_wave_size": 3.35951,
          "swell_period": 12,
          "wind_speed": 2.93567,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.630442681628523,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T17:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.46935,
          "max_wave_size": 2.70042,
          "swell_period": 12,
          "wind_speed": 8.88958,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.10247715903396,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T16:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.54877,
          "max_wave_size": 2.74013,
          "swell_period": 13,
          "wind_speed": 9.84771,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.16178958288,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T15:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.6282,
          "max_wave_size": 2.81956,
          "swell_period": 13,
          "wind_speed": 10.43819,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.238967019246946,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T14:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.66791,
          "max_wave_size": 2.89898,
          "swell_period": 13,
          "wind_speed": 9.85338,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.29540617533788,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T13:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.74733,
          "max_wave_size": 2.9387,
          "swell_period": 13,
          "wind_speed": 9.57061,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.354723095607014,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T12:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.82676,
          "max_wave_size": 3.01812,
          "swell_period": 13,
          "wind_speed": 9.92942,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.431896035550864,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T11:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 1.86647,
          "max_wave_size": 3.09754,
          "swell_period": 13,
          "wind_speed": 7.60164,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.4883351916418,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T10:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2.46215,
          "max_wave_size": 3.69322,
          "swell_period": 13,
          "wind_speed": 7.61958,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.893362466453855,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T09:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2.54157,
          "max_wave_size": 3.73294,
          "swell_period": 13,
          "wind_speed": 7.59252,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.873560839177305,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T09:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 3.13027,
          "max_wave_size": 4.3659,
          "swell_period": 13,
          "wind_speed": 9.75806,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.28165467509906,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T08:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 3.99521,
          "max_wave_size": 4.44828,
          "swell_period": 13,
          "wind_speed": 11.17259,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 18.793115684294037,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T16:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.00637,
          "max_wave_size": 3.40617,
          "swell_period": 12,
          "wind_speed": 4.19779,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.700135899877235,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T15:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.05303,
          "max_wave_size": 3.49949,
          "swell_period": 12,
          "wind_speed": 4.00314,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 17.766452974246487,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T14:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.14635,
          "max_wave_size": 3.54615,
          "swell_period": 13,
          "wind_speed": 5.71363,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 17.7946442073244,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T13:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.19301,
          "max_wave_size": 3.63947,
          "swell_period": 13,
          "wind_speed": 7.36298,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 17.777040041040593,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T12:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.28633,
          "max_wave_size": 3.68613,
          "swell_period": 13,
          "wind_speed": 8.61658,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 17.80477263896277,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T11:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.33299,
          "max_wave_size": 3.77945,
          "swell_period": 13,
          "wind_speed": 7.46179,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.787168472678964,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T10:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.37965,
          "max_wave_size": 3.82611,
          "swell_period": 13,
          "wind_speed": 10.27021,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.79054461655842,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T09:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.89291,
          "max_wave_size": 4.33936,
          "swell_period": 13,
          "wind_speed": 9.75806,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.417489766468833,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T17:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.18295,
          "max_wave_size": 3.45977,
          "swell_period": 12,
          "wind_speed": 2.93567,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.81641123806015,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T16:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.63602,
          "max_wave_size": 3.87165,
          "swell_period": 13,
          "wind_speed": 4.19779,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.76188818793252,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T15:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.71839,
          "max_wave_size": 3.95403,
          "swell_period": 13,
          "wind_speed": 4.00314,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 17.681849630908328,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T14:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.75958,
          "max_wave_size": 3.99521,
          "swell_period": 13,
          "wind_speed": 5.71363,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 17.641832238826396,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T13:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.80077,
          "max_wave_size": 4.07759,
          "swell_period": 13,
          "wind_speed": 7.36298,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": true,
          "wind_type_Offshore": false,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 17.583289583591302,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T12:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.88314,
          "max_wave_size": 4.11878,
          "swell_period": 13,
          "wind_speed": 8.61658,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.521771793297173,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T11:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.96552,
          "max_wave_size": 4.20115,
          "swell_period": 13,
          "wind_speed": 7.46179,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.441732512710214,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T10:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 3.04789,
          "max_wave_size": 4.28353,
          "swell_period": 13,
          "wind_speed": 10.27021,
          "dawn": "2025-01-12T07:38:35.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:31:22.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.361693955686018,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Rest Bay",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-12T08:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.98623,
          "max_wave_size": 4.38602,
          "swell_period": 13,
          "wind_speed": 11.17259,
          "dawn": "2025-01-12T07:38:22.000Z",
          "sunrise": "2025-01-12T08:17:14.000Z",
          "sunset": "2025-01-12T16:31:24.000Z",
          "dusk": "2025-01-12T17:10:15.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.347796548220124,
          "datetime": "2025-01-09T23:57:35.341Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T08:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 1.64407,
          "max_wave_size": 2.94202,
          "swell_period": 13,
          "wind_speed": 11.3047,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.30231433404016,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T17:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.65784,
          "max_wave_size": 3.78087,
          "swell_period": 13,
          "wind_speed": 7.39667,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.79131670763696,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T16:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.69527,
          "max_wave_size": 3.8183,
          "swell_period": 14,
          "wind_speed": 8.63926,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.754948188900777,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T15:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.73271,
          "max_wave_size": 3.89317,
          "swell_period": 14,
          "wind_speed": 8.25615,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.701739842109454,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T14:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.77014,
          "max_wave_size": 3.9306,
          "swell_period": 14,
          "wind_speed": 7.70703,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.665371323373275,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T13:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.80757,
          "max_wave_size": 3.9306,
          "swell_period": 14,
          "wind_speed": 8.22439,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.645832916283283,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T12:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.80757,
          "max_wave_size": 3.96804,
          "swell_period": 14,
          "wind_speed": 8.56661,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.628998308214,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T11:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.84501,
          "max_wave_size": 3.96804,
          "swell_period": 14,
          "wind_speed": 8.87379,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.609454681138143,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T10:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.84501,
          "max_wave_size": 4.00547,
          "swell_period": 14,
          "wind_speed": 8.88237,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.592624569491957,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T09:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.84501,
          "max_wave_size": 3.96804,
          "swell_period": 14,
          "wind_speed": 7.91003,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.609454681138143,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T09:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 1.7306,
          "max_wave_size": 3.02855,
          "swell_period": 13,
          "wind_speed": 12.34958,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.386390420768496,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T10:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 1.77387,
          "max_wave_size": 3.07182,
          "swell_period": 13,
          "wind_speed": 12.66908,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.428433322337142,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T11:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 1.81713,
          "max_wave_size": 3.11508,
          "swell_period": 13,
          "wind_speed": 12.53649,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.47046650749683,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T12:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 1.94693,
          "max_wave_size": 3.24488,
          "swell_period": 13,
          "wind_speed": 11.58402,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.59658549579381,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T13:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.20652,
          "max_wave_size": 3.50447,
          "swell_period": 13,
          "wind_speed": 11.10735,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.844793953731504,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T14:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.33631,
          "max_wave_size": 3.63426,
          "swell_period": 13,
          "wind_speed": 10.28624,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.85418507490842,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T15:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.33631,
          "max_wave_size": 3.63426,
          "swell_period": 13,
          "wind_speed": 9.39428,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.85418507490842,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T16:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.29305,
          "max_wave_size": 3.591,
          "swell_period": 13,
          "wind_speed": 8.24018,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.85105494237037,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Southerndown",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T17:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.20652,
          "max_wave_size": 3.54773,
          "swell_period": 13,
          "wind_speed": 7.65575,
          "dawn": "2025-01-11T07:38:18.000Z",
          "sunrise": "2025-01-11T08:17:13.000Z",
          "sunset": "2025-01-11T16:29:40.000Z",
          "dusk": "2025-01-11T17:08:36.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.825342427420686,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Bucks Mills",
          "sub_region": "North Devon",
          "duration_hours": "2025-01-12T08:00:00.000Z",
          "timestamp": 2.4,
          "min_wave_size": 2.621,
          "max_wave_size": 3.81236,
          "swell_period": 13,
          "wind_speed": 7.49689,
          "dawn": "2025-01-12T07:39:11.000Z",
          "sunrise": "2025-01-12T08:17:29.000Z",
          "sunset": "2025-01-12T16:36:04.000Z",
          "dusk": "2025-01-12T17:14:22.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.79638789923346,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T08:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.80757,
          "max_wave_size": 3.96804,
          "swell_period": 14,
          "wind_speed": 7.07476,
          "dawn": "2025-01-11T07:27:49.000Z",
          "sunrise": "2025-01-11T08:05:57.000Z",
          "sunset": "2025-01-11T16:24:49.000Z",
          "dusk": "2025-01-11T17:02:56.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.628998308214,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T12:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.64711,
          "max_wave_size": 2.80757,
          "swell_period": 13,
          "wind_speed": 10.51171,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.243446801224877,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T10:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.11927,
          "max_wave_size": 3.46004,
          "swell_period": 13,
          "wind_speed": 12.66908,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.783291771500004,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T09:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.07602,
          "max_wave_size": 3.37354,
          "swell_period": 13,
          "wind_speed": 12.34958,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.721821272861554,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T08:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 1.98952,
          "max_wave_size": 3.28704,
          "swell_period": 13,
          "wind_speed": 11.3047,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.637774335360096,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T17:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.64711,
          "max_wave_size": 2.77014,
          "swell_period": 12,
          "wind_speed": 10.96053,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.22661668957869,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T16:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.57224,
          "max_wave_size": 2.69527,
          "swell_period": 12,
          "wind_speed": 9.35783,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.153869935697372,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T15:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.53481,
          "max_wave_size": 2.65784,
          "swell_period": 12,
          "wind_speed": 10.30807,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.117501416961197,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T14:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.49737,
          "max_wave_size": 2.65784,
          "swell_period": 12,
          "wind_speed": 9.91179,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.09795778988534,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T13:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.57224,
          "max_wave_size": 2.69527,
          "swell_period": 13,
          "wind_speed": 9.41067,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.153869935697372,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T17:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.63475,
          "max_wave_size": 3.74803,
          "swell_period": 13,
          "wind_speed": 6.14324,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.81813590844296,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T11:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.79685,
          "max_wave_size": 2.91988,
          "swell_period": 13,
          "wind_speed": 11.27364,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.37211019734133,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T10:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 1.90915,
          "max_wave_size": 3.06962,
          "swell_period": 13,
          "wind_speed": 9.19854,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.498060078028107,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T09:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.3958,
          "max_wave_size": 3.55626,
          "swell_period": 13,
          "wind_speed": 10.25583,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.920310870959344,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Milford on Sea",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T08:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.58297,
          "max_wave_size": 3.706,
          "swell_period": 13,
          "wind_speed": 8.50714,
          "dawn": "2025-01-10T07:28:18.000Z",
          "sunrise": "2025-01-10T08:06:32.000Z",
          "sunset": "2025-01-10T16:23:27.000Z",
          "dusk": "2025-01-10T17:01:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 4,
          "weighted_sum": 19.864063461518274,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T17:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.6887,
          "max_wave_size": 2.92433,
          "swell_period": 12,
          "wind_speed": 13.65434,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.317656958496624,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T16:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.60632,
          "max_wave_size": 2.84196,
          "swell_period": 12,
          "wind_speed": 12.82392,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.23761767790966,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T15:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.56514,
          "max_wave_size": 2.80077,
          "swell_period": 12,
          "wind_speed": 13.05452,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.197601009390496,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T14:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.56514,
          "max_wave_size": 2.84196,
          "swell_period": 12,
          "wind_speed": 13.46831,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.216121776120566,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T12:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.72478,
          "max_wave_size": 4.06555,
          "swell_period": 13,
          "wind_speed": 11.58402,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.628369949580847,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T11:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.16252,
          "max_wave_size": 3.50329,
          "swell_period": 13,
          "wind_speed": 12.53649,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.82235659385394,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T16:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.67186,
          "max_wave_size": 3.78514,
          "swell_period": 14,
          "wind_speed": 7.05573,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.78207831479349,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T15:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.70897,
          "max_wave_size": 3.85936,
          "swell_period": 14,
          "wind_speed": 6.65917,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.72933449503689,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T14:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.74608,
          "max_wave_size": 3.89647,
          "swell_period": 14,
          "wind_speed": 6.27036,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.69327690138742,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T13:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.78319,
          "max_wave_size": 3.89647,
          "swell_period": 14,
          "wind_speed": 6.80279,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.673905533845087,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T12:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.78319,
          "max_wave_size": 3.93358,
          "swell_period": 14,
          "wind_speed": 7.45848,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.657219307737954,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T11:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.8203,
          "max_wave_size": 3.93358,
          "swell_period": 14,
          "wind_speed": 7.41694,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.63784794019562,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T10:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.8203,
          "max_wave_size": 3.97069,
          "swell_period": 14,
          "wind_speed": 7.25734,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.621161714088487,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T08:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.78319,
          "max_wave_size": 3.93358,
          "swell_period": 14,
          "wind_speed": 6.90304,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.657219307737954,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T17:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.55178,
          "max_wave_size": 3.84929,
          "swell_period": 13,
          "wind_speed": 7.65575,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.815915350894578,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T16:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.63828,
          "max_wave_size": 3.93579,
          "swell_period": 13,
          "wind_speed": 8.24018,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.731868413393123,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T15:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.68153,
          "max_wave_size": 3.97904,
          "swell_period": 13,
          "wind_speed": 9.39428,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.689844944642395,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T14:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.68153,
          "max_wave_size": 4.02229,
          "swell_period": 13,
          "wind_speed": 10.28624,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.67039791475467,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Ogmore Beach",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-11T13:00:00.000Z",
          "timestamp": 1.4,
          "min_wave_size": 2.76803,
          "max_wave_size": 4.1088,
          "swell_period": 13,
          "wind_speed": 11.10735,
          "dawn": "2025-01-11T07:38:29.000Z",
          "sunrise": "2025-01-11T08:17:26.000Z",
          "sunset": "2025-01-11T16:29:43.000Z",
          "dusk": "2025-01-11T17:08:40.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.58634648083012,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Hordle Cliff",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-11T09:00:00.000Z",
          "timestamp": 2.5,
          "min_wave_size": 2.8203,
          "max_wave_size": 3.93358,
          "swell_period": 14,
          "wind_speed": 6.66478,
          "dawn": "2025-01-11T07:27:54.000Z",
          "sunrise": "2025-01-11T08:06:01.000Z",
          "sunset": "2025-01-11T16:24:52.000Z",
          "dusk": "2025-01-11T17:02:59.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.63784794019562,
          "datetime": "2025-01-09T23:57:35.340Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T11:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.6885,
          "max_wave_size": 2.83975,
          "swell_period": 11,
          "wind_speed": 10.27984,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.27952181223821,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T10:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.80363,
          "max_wave_size": 2.95488,
          "swell_period": 11,
          "wind_speed": 10.52648,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.391386828591305,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T09:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.88038,
          "max_wave_size": 3.07,
          "swell_period": 11,
          "wind_speed": 9.65207,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.483213042774203,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T08:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 2.37925,
          "max_wave_size": 3.56888,
          "swell_period": 12,
          "wind_speed": 8.44097,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.905997308407535,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T17:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.86513,
          "max_wave_size": 3.06969,
          "swell_period": 12,
          "wind_speed": 13.65434,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.47511317521522,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T16:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.74856,
          "max_wave_size": 2.95312,
          "swell_period": 12,
          "wind_speed": 12.82392,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.36184899597193,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T15:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.7097,
          "max_wave_size": 2.91426,
          "swell_period": 12,
          "wind_speed": 13.05452,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.324091030754513,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T14:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.7097,
          "max_wave_size": 2.91426,
          "swell_period": 12,
          "wind_speed": 13.46831,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.324091030754513,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T13:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.78741,
          "max_wave_size": 2.95312,
          "swell_period": 12,
          "wind_speed": 13.69293,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.38212864105465,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T12:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.86513,
          "max_wave_size": 3.06969,
          "swell_period": 12,
          "wind_speed": 14.62094,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.47511317521522,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T11:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 1.9817,
          "max_wave_size": 3.18626,
          "swell_period": 12,
          "wind_speed": 15.36108,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.588377354458512,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T10:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.44798,
          "max_wave_size": 3.65254,
          "swell_period": 13,
          "wind_speed": 14.15506,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.904257195636372,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T09:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.60341,
          "max_wave_size": 3.80797,
          "swell_period": 13,
          "wind_speed": 12.6111,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.807543784107615,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T12:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.6885,
          "max_wave_size": 2.83975,
          "swell_period": 11,
          "wind_speed": 8.96346,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.27952181223821,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T13:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.6885,
          "max_wave_size": 2.83975,
          "swell_period": 11,
          "wind_speed": 8.93083,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.27952181223821,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T14:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.76525,
          "max_wave_size": 2.95488,
          "swell_period": 11,
          "wind_speed": 9.70708,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.371352522844205,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T15:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 1.91875,
          "max_wave_size": 3.10838,
          "swell_period": 11,
          "wind_speed": 9.79869,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.52049940037569,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T16:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 2.149,
          "max_wave_size": 3.30025,
          "swell_period": 11,
          "wind_speed": 10.77054,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.726962444832665,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Chesil Beach",
          "sub_region": "Southern England West",
          "duration_hours": "2025-01-10T17:00:00.000Z",
          "timestamp": 2.2,
          "min_wave_size": 2.3025,
          "max_wave_size": 3.45375,
          "swell_period": 11,
          "wind_speed": 9.76524,
          "dawn": "2025-01-10T07:31:51.000Z",
          "sunrise": "2025-01-10T08:09:59.000Z",
          "sunset": "2025-01-10T16:27:44.000Z",
          "dusk": "2025-01-10T17:05:51.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 2,
          "weighted_sum": 19.87610932236415,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T08:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.63602,
          "max_wave_size": 3.91284,
          "swell_period": 13,
          "wind_speed": 13.26281,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.743367421202457,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T09:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 2.14176,
          "max_wave_size": 3.3774,
          "swell_period": 13,
          "wind_speed": 12.6111,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.757873079248153,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T10:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.97701,
          "max_wave_size": 3.25383,
          "swell_period": 13,
          "wind_speed": 14.15506,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.61631151194397,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T11:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.85345,
          "max_wave_size": 3.08908,
          "swell_period": 13,
          "wind_speed": 15.36108,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.477734796107775,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T12:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.72989,
          "max_wave_size": 2.96552,
          "swell_period": 12,
          "wind_speed": 14.62094,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.35767884700165,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Sker",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T13:00:00.000Z",
          "timestamp": 1.6,
          "min_wave_size": 1.64751,
          "max_wave_size": 2.88314,
          "swell_period": 12,
          "wind_speed": 13.69293,
          "dawn": "2025-01-10T07:39:39.000Z",
          "sunrise": "2025-01-10T08:18:46.000Z",
          "sunset": "2025-01-10T16:28:30.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 3,
          "weighted_sum": 19.277635069991593,
          "datetime": "2025-01-09T23:57:35.339Z"
      },
      {
          "spot_name": "Aberavon",
          "sub_region": "Severn Estuary",
          "duration_hours": "2025-01-10T08:00:00.000Z",
          "timestamp": 1.5,
          "min_wave_size": 2.79769,
          "max_wave_size": 4.00225,
          "swell_period": 13,
          "wind_speed": 13.26281,
          "dawn": "2025-01-10T07:40:06.000Z",
          "sunrise": "2025-01-10T08:19:19.000Z",
          "sunset": "2025-01-10T16:28:26.000Z",
          "dusk": "2025-01-10T17:07:38.000Z",
          "wind_type_Cross-shore": false,
          "wind_type_Offshore": true,
          "wind_type_Onshore": false,
          "rank": 1,
          "weighted_sum": 19.61877339083845,
          "datetime": "2025-01-09T23:57:35.339Z"
      }
  ]
}