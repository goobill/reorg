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
      [0.2, 'rgb(44, 47, 54)'],      // Dark grey for low values
      [0.5, 'rgb(50, 120, 200)'], // Intermediate blue
      [1, 'rgb(0, 150, 255)']     // Ocean blue for high values
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
        text: z[i][j].toFixed(2),
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

const renderIndicators = async (div_id, i_t, i_t_d, o_t, o_t_d, i_h, i_h_d, o_h, o_h_d) => {
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
    const data = await fetchData(url);   

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
      indoorMetrics.averages.today.avgTemp,
      indoorMetrics.averages.yesterday.avgTemp,
      outdoorMetrics.averages.today.avgTemp,
      outdoorMetrics.averages.yesterday.avgTemp,
      indoorMetrics.averages.today.avgHumidity,
      indoorMetrics.averages.yesterday.avgHumidity,
      outdoorMetrics.averages.today.avgHumidity,
      outdoorMetrics.averages.yesterday.avgHumidity,
    )
    if (firstDate) {
      renderHeatmap("plot_heatmap_1", secondDate, secondData)
    }
    if (secondDate) {
      renderHeatmap("plot_heatmap_2", firstDate, firstData)
    }
};

document.addEventListener('DOMContentLoaded', renderApp);

const data = {
  "metrics": [
    {
      "temperature_c": 15,
      "humidity": 51,
      "datetime": "2024-12-17T13:46:49.250Z"
    },
    {
      "temperature_c": 15,
      "humidity": 51,
      "datetime": "2024-12-17T13:31:48.736Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-17T13:16:48.211Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-17T13:01:47.741Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T12:46:48.219Z"
    },
    {
      "temperature_c": 16,
      "humidity": 53,
      "datetime": "2024-12-17T12:31:46.729Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-17T12:16:46.236Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-17T12:01:45.716Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-17T11:46:45.241Z"
    },
    {
      "temperature_c": 16,
      "humidity": 54,
      "datetime": "2024-12-17T11:31:44.718Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T11:16:45.204Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T11:01:45.212Z"
    },
    {
      "temperature_c": 16,
      "humidity": 53,
      "datetime": "2024-12-17T10:46:43.271Z"
    },
    {
      "temperature_c": 16,
      "humidity": 52,
      "datetime": "2024-12-17T10:31:42.768Z"
    },
    {
      "temperature_c": 16,
      "humidity": 50,
      "datetime": "2024-12-17T10:16:42.224Z"
    },
    {
      "temperature_c": 16,
      "humidity": 50,
      "datetime": "2024-12-17T10:01:41.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-17T09:36:12.843Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T09:21:13.369Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-17T09:06:11.854Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-17T08:51:12.813Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T08:36:11.796Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T08:21:10.315Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T08:06:10.326Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T07:51:09.462Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T07:36:08.993Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T07:21:09.472Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T07:06:08.941Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T06:51:07.488Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T06:36:06.995Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T06:21:07.479Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T06:06:06.947Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T05:51:05.486Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T05:36:05.395Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T05:21:04.464Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T05:06:03.974Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T04:51:03.466Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T04:36:02.993Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T04:21:02.451Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T04:06:02.957Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T03:51:01.475Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T03:36:01.957Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-17T03:21:00.504Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-17T03:05:59.983Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-17T02:50:59.483Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T02:35:59.942Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-17T02:20:58.504Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T02:05:58.948Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-17T01:50:57.470Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-17T01:35:57.982Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-17T01:20:56.468Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-17T01:05:56.233Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-17T00:50:55.978Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-17T00:35:56.369Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-17T00:16:25.143Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-17T00:01:25.586Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T23:46:24.112Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T23:31:24.602Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T23:16:23.108Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T23:01:22.626Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T22:46:22.140Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T22:31:23.121Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T22:16:22.455Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T22:01:20.962Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-16T21:46:21.277Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T21:31:19.953Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T21:16:20.472Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T21:01:18.972Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T20:46:18.484Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T20:31:17.987Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T20:16:17.462Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T20:01:16.987Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T19:46:16.489Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T19:31:16.949Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-16T19:16:15.472Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T19:01:14.971Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T18:46:14.474Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T18:31:13.978Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T18:16:13.493Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T18:01:14.013Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T17:46:12.512Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T17:31:12.959Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T17:16:11.484Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T17:01:10.974Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-16T16:46:11.701Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-16T16:19:45.939Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-16T16:04:45.420Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-16T15:49:44.945Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-16T15:34:45.217Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T15:19:44.912Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-16T15:04:43.402Z"
    },
    {
      "temperature_c": 15,
      "humidity": 61,
      "datetime": "2024-12-16T14:49:42.913Z"
    },
    {
      "temperature_c": 15,
      "humidity": 62,
      "datetime": "2024-12-16T14:34:42.424Z"
    },
    {
      "temperature_c": 15,
      "humidity": 61,
      "datetime": "2024-12-16T14:19:43.106Z"
    },
    {
      "temperature_c": 15,
      "humidity": 53,
      "datetime": "2024-12-16T13:59:53.341Z"
    },
    {
      "temperature_c": 15,
      "humidity": 51,
      "datetime": "2024-12-16T13:44:52.830Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-16T13:29:52.335Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-16T13:14:51.862Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-16T12:59:51.419Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T12:44:51.801Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-16T12:29:50.332Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T12:14:49.833Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T11:59:49.319Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T11:44:48.852Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T11:29:48.341Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T11:14:48.815Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T10:59:47.358Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T10:44:46.847Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T10:29:46.348Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T10:14:45.867Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T09:59:45.333Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T09:44:44.816Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T09:29:45.500Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T09:12:16.779Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T08:57:17.384Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T08:42:16.732Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T08:27:15.285Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T08:12:14.765Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T07:57:14.431Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T07:42:13.921Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T07:27:13.398Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T07:12:12.959Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T06:57:13.407Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T06:42:12.885Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T06:27:11.432Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T06:12:10.934Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T05:57:11.410Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-16T05:42:09.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-16T05:27:09.396Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T05:12:08.915Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T04:57:08.494Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T04:42:08.877Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T04:27:08.383Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T04:12:06.922Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T03:57:06.662Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T03:42:07.398Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T03:27:05.929Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T03:12:06.420Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T02:57:04.926Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-16T02:42:04.425Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T02:27:03.922Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T02:12:04.122Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T01:57:02.908Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-16T01:42:02.375Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-16T01:27:02.893Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-16T01:12:01.442Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-16T00:57:00.921Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-16T00:42:00.409Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-16T00:26:59.946Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-16T00:11:59.414Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-15T23:56:58.935Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-15T23:41:58.407Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-15T23:26:57.917Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-15T23:11:57.495Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-15T22:56:56.900Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-15T22:41:57.108Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T22:26:57.002Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-15T22:11:55.521Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-15T21:56:55.024Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-15T21:41:54.513Z"
    },
    {
      "temperature_c": 16,
      "humidity": 45,
      "datetime": "2024-12-15T21:26:54.017Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T21:11:55.554Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T20:54:34.967Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T20:06:04.922Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T19:32:49.704Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T19:16:32.178Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T19:01:23.140Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T18:46:03.107Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T18:30:44.341Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T18:15:32.035Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T18:00:03.061Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T17:44:42.999Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T17:29:32.009Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T17:14:23.007Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T16:59:03.039Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T16:43:42.031Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-15T16:28:32.027Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-15T16:13:02.016Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T15:57:52.012Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T15:42:23.017Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T15:27:02.053Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T15:11:42.039Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T14:56:33.060Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T14:41:13.000Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T14:26:02.020Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T14:10:53.031Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T13:55:22.035Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T13:40:02.042Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T13:24:42.984Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T13:09:32.024Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T12:54:03.011Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T12:38:42.017Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T12:23:02.016Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T12:07:52.985Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T11:52:42.033Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T11:37:32.984Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T11:22:22.005Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T11:07:02.044Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T10:51:52.026Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T10:36:22.007Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T10:21:02.034Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T10:05:42.021Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T09:50:32.021Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T09:35:02.031Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T09:19:52.010Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T09:04:42.016Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T08:49:12.049Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T08:34:02.039Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T08:18:42.045Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T08:03:32.033Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T07:48:01.909Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T07:32:41.921Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T07:17:21.915Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T07:02:11.913Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T06:47:01.915Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T06:31:31.931Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T06:16:01.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T06:00:51.942Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T05:45:41.918Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T05:30:11.929Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-15T05:15:01.937Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T04:59:41.934Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T04:44:31.930Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T04:29:01.922Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-15T04:13:51.921Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T03:58:41.920Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T03:43:11.924Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T03:28:01.926Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T03:12:31.942Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T02:57:01.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T02:41:51.957Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T02:26:41.908Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T02:11:31.916Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-15T01:56:01.922Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T01:40:52.914Z"
    },
    {
      "temperature_c": 15,
      "humidity": 43,
      "datetime": "2024-12-15T01:25:31.949Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T01:10:02.874Z"
    },
    {
      "temperature_c": 16,
      "humidity": 43,
      "datetime": "2024-12-15T00:54:51.921Z"
    },
    {
      "temperature_c": 16,
      "humidity": 43,
      "datetime": "2024-12-15T00:39:41.915Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-15T00:24:01.982Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-15T00:08:42.906Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T23:53:31.934Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T23:38:21.935Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T23:23:01.925Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T23:07:42.912Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T22:52:31.923Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T22:37:11.931Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T22:22:02.030Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T22:06:32.008Z"
    },
    {
      "temperature_c": 16,
      "humidity": 43,
      "datetime": "2024-12-14T21:51:02.030Z"
    },
    {
      "temperature_c": 16,
      "humidity": 43,
      "datetime": "2024-12-14T21:35:52.021Z"
    },
    {
      "temperature_c": 16,
      "humidity": 43,
      "datetime": "2024-12-14T21:20:42.025Z"
    },
    {
      "temperature_c": 16,
      "humidity": 43,
      "datetime": "2024-12-14T21:05:32.050Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T20:50:02.035Z"
    },
    {
      "temperature_c": 16,
      "humidity": 44,
      "datetime": "2024-12-14T20:34:52.008Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T20:19:22.032Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T20:04:02.021Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T19:48:42.986Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T19:33:32.035Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T19:18:12.982Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T19:03:02.035Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T18:47:42.017Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T18:32:23.037Z"
    },
    {
      "temperature_c": 15,
      "humidity": 43,
      "datetime": "2024-12-14T18:17:02.047Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T18:01:42.030Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T17:46:02.058Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T17:30:42.013Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T17:15:32.047Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T17:00:22.010Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T16:45:02.020Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T16:29:42.041Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T16:14:32.037Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T15:59:22.013Z"
    },
    {
      "temperature_c": 14,
      "humidity": 44,
      "datetime": "2024-12-14T15:44:02.014Z"
    },
    {
      "temperature_c": 14,
      "humidity": 43,
      "datetime": "2024-12-14T15:28:52.024Z"
    },
    {
      "temperature_c": 14,
      "humidity": 43,
      "datetime": "2024-12-14T15:13:02.027Z"
    },
    {
      "temperature_c": 13,
      "humidity": 43,
      "datetime": "2024-12-14T14:57:52.092Z"
    },
    {
      "temperature_c": 13,
      "humidity": 43,
      "datetime": "2024-12-14T14:42:42.021Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T14:27:33.052Z"
    },
    {
      "temperature_c": 12,
      "humidity": 43,
      "datetime": "2024-12-14T14:12:02.038Z"
    },
    {
      "temperature_c": 12,
      "humidity": 43,
      "datetime": "2024-12-14T13:56:52.042Z"
    },
    {
      "temperature_c": 12,
      "humidity": 43,
      "datetime": "2024-12-14T13:41:42.015Z"
    },
    {
      "temperature_c": 12,
      "humidity": 43,
      "datetime": "2024-12-14T13:26:12.029Z"
    },
    {
      "temperature_c": 12,
      "humidity": 44,
      "datetime": "2024-12-14T13:11:02.053Z"
    },
    {
      "temperature_c": 14,
      "humidity": 45,
      "datetime": "2024-12-14T12:55:32.023Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T12:40:22.994Z"
    },
    {
      "temperature_c": 14,
      "humidity": 45,
      "datetime": "2024-12-14T12:25:02.013Z"
    },
    {
      "temperature_c": 14,
      "humidity": 45,
      "datetime": "2024-12-14T12:09:52.020Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T11:54:23.018Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T11:39:02.050Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T11:23:42.988Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T11:08:32.023Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T10:53:02.987Z"
    },
    {
      "temperature_c": 14,
      "humidity": 45,
      "datetime": "2024-12-14T10:37:52.026Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T10:22:42.034Z"
    },
    {
      "temperature_c": 14,
      "humidity": 45,
      "datetime": "2024-12-14T10:07:12.033Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T09:52:02.058Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T09:36:42.022Z"
    },
    {
      "temperature_c": 14,
      "humidity": 45,
      "datetime": "2024-12-14T09:21:32.035Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T09:06:02.029Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T08:50:52.027Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T08:35:42.031Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T08:20:12.036Z"
    },
    {
      "temperature_c": 15,
      "humidity": 44,
      "datetime": "2024-12-14T08:05:02.029Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T07:49:31.915Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T07:34:01.920Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T07:18:51.916Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T07:03:41.928Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T06:48:11.927Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T06:33:01.948Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T06:17:41.907Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T06:02:31.924Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T05:47:01.927Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T05:31:52.884Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T05:16:42.022Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T05:01:12.918Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T04:46:02.921Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T04:30:31.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-14T04:15:21.929Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-14T04:00:01.918Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T03:44:42.882Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-14T03:29:31.919Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-14T03:14:01.933Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-14T02:58:51.905Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-14T02:43:31.915Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-14T02:28:01.944Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-14T02:12:51.905Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-14T01:57:41.939Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-14T01:42:11.910Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T01:27:02.896Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-14T01:11:41.918Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-14T00:56:22.897Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-14T00:41:01.937Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-14T00:25:41.914Z"
    },
    {
      "temperature_c": 15,
      "humidity": 51,
      "datetime": "2024-12-14T00:10:31.926Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-13T23:55:11.957Z"
    },
    {
      "temperature_c": 15,
      "humidity": 51,
      "datetime": "2024-12-13T23:40:01.926Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T23:24:31.944Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-13T23:09:21.904Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-13T22:54:01.932Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T22:38:42.886Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-13T22:23:32.032Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-13T22:08:02.047Z"
    },
    {
      "temperature_c": 16,
      "humidity": 48,
      "datetime": "2024-12-13T21:52:52.023Z"
    },
    {
      "temperature_c": 16,
      "humidity": 47,
      "datetime": "2024-12-13T21:37:22.039Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-13T21:22:02.022Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-13T21:06:42.025Z"
    },
    {
      "temperature_c": 16,
      "humidity": 46,
      "datetime": "2024-12-13T20:51:32.022Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T20:36:22.976Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T20:21:02.981Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T20:05:42.077Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T19:50:22.020Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-13T19:35:02.019Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-13T19:19:42.022Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T19:04:33.044Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-13T18:49:02.043Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-13T18:33:52.019Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-13T18:18:22.016Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-13T18:03:02.023Z"
    },
    {
      "temperature_c": 15,
      "humidity": 45,
      "datetime": "2024-12-13T17:47:42.048Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T17:32:33.001Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T17:17:22.024Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T17:02:02.029Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-13T16:46:52.025Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-13T16:31:22.046Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-13T16:16:02.009Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T16:00:42.032Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T15:45:32.022Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T15:30:02.037Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T15:14:53.008Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T14:59:42.047Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T14:44:11.927Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-13T14:29:01.913Z"
    },
    {
      "temperature_c": 16,
      "humidity": 50,
      "datetime": "2024-12-13T14:13:31.924Z"
    },
    {
      "temperature_c": 16,
      "humidity": 49,
      "datetime": "2024-12-13T13:58:21.930Z"
    },
    {
      "temperature_c": 16,
      "humidity": 49,
      "datetime": "2024-12-13T13:43:01.953Z"
    },
    {
      "temperature_c": 16,
      "humidity": 49,
      "datetime": "2024-12-13T13:27:51.922Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T13:12:41.920Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T12:57:01.964Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T12:41:41.905Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T12:26:11.908Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T12:11:01.916Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T11:55:51.938Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T11:40:42.886Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-13T11:25:11.942Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T11:10:02.894Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T10:54:41.916Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T10:39:31.939Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T10:24:01.921Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T10:08:51.920Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T09:53:41.921Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T09:38:11.923Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T09:23:01.941Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T09:07:31.926Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T08:52:01.915Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T08:36:52.888Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T08:21:41.939Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T08:06:32.880Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T07:51:01.942Z"
    },
    {
      "temperature_c": 14,
      "humidity": 50,
      "datetime": "2024-12-13T07:35:41.941Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T07:20:31.944Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T07:05:01.934Z"
    },
    {
      "temperature_c": 14,
      "humidity": 51,
      "datetime": "2024-12-13T06:49:51.931Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T06:34:42.887Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T06:19:12.905Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T06:04:02.905Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T05:48:52.912Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-13T05:33:21.919Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T05:18:02.960Z"
    },
    {
      "temperature_c": 15,
      "humidity": 53,
      "datetime": "2024-12-13T05:02:41.934Z"
    },
    {
      "temperature_c": 15,
      "humidity": 53,
      "datetime": "2024-12-13T04:47:31.936Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-13T04:32:01.924Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-13T04:16:51.953Z"
    },
    {
      "temperature_c": 15,
      "humidity": 55,
      "datetime": "2024-12-13T04:01:31.906Z"
    },
    {
      "temperature_c": 15,
      "humidity": 55,
      "datetime": "2024-12-13T03:46:01.944Z"
    },
    {
      "temperature_c": 15,
      "humidity": 56,
      "datetime": "2024-12-13T03:30:51.933Z"
    },
    {
      "temperature_c": 15,
      "humidity": 56,
      "datetime": "2024-12-13T03:15:41.949Z"
    },
    {
      "temperature_c": 15,
      "humidity": 56,
      "datetime": "2024-12-13T03:00:01.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 56,
      "datetime": "2024-12-13T02:44:41.923Z"
    },
    {
      "temperature_c": 15,
      "humidity": 55,
      "datetime": "2024-12-13T02:29:01.935Z"
    },
    {
      "temperature_c": 15,
      "humidity": 54,
      "datetime": "2024-12-13T02:13:41.936Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-13T01:58:32.900Z"
    },
    {
      "temperature_c": 15,
      "humidity": 52,
      "datetime": "2024-12-13T01:43:01.937Z"
    },
    {
      "temperature_c": 16,
      "humidity": 52,
      "datetime": "2024-12-13T01:27:51.986Z"
    },
    {
      "temperature_c": 16,
      "humidity": 48,
      "datetime": "2024-12-12T23:38:07.130Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-12T23:22:57.095Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T23:07:48.065Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-12T22:52:17.117Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T22:37:08.075Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T22:21:38.055Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-12T22:06:07.130Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-12T21:50:57.104Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-12T21:35:47.136Z"
    },
    {
      "temperature_c": 15,
      "humidity": 50,
      "datetime": "2024-12-12T21:20:37.117Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T21:05:08.123Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T20:49:58.081Z"
    },
    {
      "temperature_c": 15,
      "humidity": 48,
      "datetime": "2024-12-12T20:34:37.116Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T20:19:07.119Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T20:03:58.063Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T19:48:47.116Z"
    },
    {
      "temperature_c": 15,
      "humidity": 49,
      "datetime": "2024-12-12T19:33:17.094Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T19:18:08.109Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T19:02:57.123Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T18:47:17.083Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T18:32:07.107Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T18:16:38.092Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T18:01:07.088Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T17:45:57.091Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T17:30:47.112Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T17:15:18.072Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T17:00:07.093Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T16:44:37.129Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T16:29:27.091Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T16:14:07.101Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T15:58:38.092Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T15:43:27.099Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T15:28:17.090Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T15:13:07.109Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T14:57:37.086Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T14:42:07.122Z"
    },
    {
      "temperature_c": null,
      "humidity": null,
      "datetime": "2024-12-12T14:26:58.093Z"
    },
    {
      "temperature_c": 15,
      "humidity": 46,
      "datetime": "2024-12-12T14:11:47.120Z"
    },
    {
      "temperature_c": 15,
      "humidity": 47,
      "datetime": "2024-12-12T13:56:37.118Z"
    }
  ],
  "weather": [
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.38,
      "datetime": "2024-12-17T13:46:49.807Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-17T13:31:49.673Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-17T13:16:48.754Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-17T13:01:48.282Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-17T12:46:47.768Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-17T12:31:47.465Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-17T12:16:46.786Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-17T12:01:46.254Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.19,
      "temperature_apparent": 10.19,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-17T11:46:45.842Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.19,
      "temperature_apparent": 10.19,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-17T11:31:45.583Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-17T11:16:44.726Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-17T11:01:44.813Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-17T10:46:43.818Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-17T10:31:43.651Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-17T10:16:42.763Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-17T10:01:42.755Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-17T09:36:13.357Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-17T09:21:13.158Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-17T09:06:12.359Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.69,
      "datetime": "2024-12-17T08:51:12.637Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-17T08:36:11.306Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.31,
      "datetime": "2024-12-17T08:21:11.196Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 4.19,
      "datetime": "2024-12-17T08:06:10.886Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.13,
      "datetime": "2024-12-17T07:51:09.957Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.13,
      "datetime": "2024-12-17T07:36:09.504Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 4.13,
      "datetime": "2024-12-17T07:21:09.242Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 4.13,
      "datetime": "2024-12-17T07:06:08.423Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-17T06:51:07.996Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-17T06:36:07.521Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.5,
      "temperature_apparent": 9.5,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-17T06:21:07.306Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.81,
      "temperature_apparent": 8.81,
      "uv_index": 0,
      "wind_speed": 3.81,
      "datetime": "2024-12-17T06:06:06.417Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.69,
      "temperature_apparent": 8.69,
      "uv_index": 0,
      "wind_speed": 3.69,
      "datetime": "2024-12-17T05:51:05.974Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.5,
      "temperature_apparent": 8.5,
      "uv_index": 0,
      "wind_speed": 3.63,
      "datetime": "2024-12-17T05:36:05.912Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.38,
      "temperature_apparent": 8.38,
      "uv_index": 0,
      "wind_speed": 3.63,
      "datetime": "2024-12-17T05:21:05.282Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.88,
      "temperature_apparent": 7.88,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-17T05:06:04.504Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.88,
      "temperature_apparent": 7.88,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-17T04:51:03.947Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.63,
      "temperature_apparent": 7.63,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-17T04:36:03.498Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-17T04:21:03.255Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-17T04:06:02.406Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 3.19,
      "datetime": "2024-12-17T03:51:02.067Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-17T03:36:01.476Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-17T03:21:01.247Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-17T03:06:00.509Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-17T02:51:00.010Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.31,
      "datetime": "2024-12-17T02:35:59.402Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-17T02:20:59.355Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-17T02:05:58.434Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.31,
      "datetime": "2024-12-17T01:50:57.989Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-17T01:35:58.480Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.63,
      "datetime": "2024-12-17T01:20:57.168Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-17T01:05:56.759Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-17T00:50:56.462Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-17T00:35:56.880Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-17T00:16:25.955Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.13,
      "temperature_apparent": 7.13,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-17T00:01:25.089Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-16T23:46:24.599Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-16T23:31:24.033Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.38,
      "temperature_apparent": 7.38,
      "uv_index": 0,
      "wind_speed": 3,
      "datetime": "2024-12-16T23:16:23.635Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.5,
      "temperature_apparent": 7.5,
      "uv_index": 0,
      "wind_speed": 3.13,
      "datetime": "2024-12-16T23:01:23.322Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.63,
      "temperature_apparent": 7.63,
      "uv_index": 0,
      "wind_speed": 3.19,
      "datetime": "2024-12-16T22:46:22.627Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.69,
      "temperature_apparent": 7.69,
      "uv_index": 0,
      "wind_speed": 3.31,
      "datetime": "2024-12-16T22:31:22.709Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.81,
      "temperature_apparent": 7.81,
      "uv_index": 0,
      "wind_speed": 3.38,
      "datetime": "2024-12-16T22:16:22.012Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.88,
      "temperature_apparent": 7.88,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T22:01:21.887Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8,
      "temperature_apparent": 8,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T21:46:21.850Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.13,
      "temperature_apparent": 8.13,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T21:31:20.467Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.19,
      "temperature_apparent": 8.19,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T21:16:19.999Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.31,
      "temperature_apparent": 8.31,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T21:01:19.827Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.38,
      "temperature_apparent": 8.38,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T20:46:19.071Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.63,
      "temperature_apparent": 8.63,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T20:31:18.570Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.69,
      "temperature_apparent": 8.69,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-16T20:16:18.031Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.81,
      "temperature_apparent": 8.81,
      "uv_index": 0,
      "wind_speed": 3.63,
      "datetime": "2024-12-16T20:01:17.772Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.81,
      "temperature_apparent": 8.81,
      "uv_index": 0,
      "wind_speed": 3.69,
      "datetime": "2024-12-16T19:46:17.037Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.88,
      "temperature_apparent": 8.88,
      "uv_index": 0,
      "wind_speed": 3.81,
      "datetime": "2024-12-16T19:31:16.524Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9,
      "temperature_apparent": 9,
      "uv_index": 0,
      "wind_speed": 3.81,
      "datetime": "2024-12-16T19:16:16.004Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.19,
      "temperature_apparent": 9.19,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-16T19:01:15.539Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.38,
      "temperature_apparent": 9.38,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-16T18:46:15.019Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-16T18:31:14.619Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.13,
      "temperature_apparent": 9.13,
      "uv_index": 0,
      "wind_speed": 3.81,
      "datetime": "2024-12-16T18:16:14.050Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.19,
      "temperature_apparent": 9.19,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-16T18:01:13.572Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.38,
      "temperature_apparent": 9.38,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-16T17:46:13.063Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.5,
      "temperature_apparent": 9.5,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-16T17:31:12.485Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-16T17:16:12.062Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.69,
      "temperature_apparent": 9.69,
      "uv_index": 0,
      "wind_speed": 4.13,
      "datetime": "2024-12-16T17:01:11.494Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.19,
      "datetime": "2024-12-16T16:46:12.313Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 4.31,
      "datetime": "2024-12-16T16:19:46.467Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.38,
      "datetime": "2024-12-16T16:04:45.997Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-16T15:49:45.760Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 4.69,
      "datetime": "2024-12-16T15:34:45.793Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.19,
      "temperature_apparent": 10.19,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-16T15:19:44.467Z"
    },
    {
      "humidity": 85,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T15:04:43.965Z"
    },
    {
      "humidity": 84,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T14:49:43.534Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T14:34:43.260Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T14:19:43.730Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T13:59:53.857Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T13:44:53.398Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T13:29:53.217Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T13:14:52.396Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-16T12:59:51.970Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.81,
      "temperature_apparent": 10.81,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-16T12:44:51.293Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-16T12:29:51.229Z"
    },
    {
      "humidity": 85,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 5.38,
      "datetime": "2024-12-16T12:14:50.377Z"
    },
    {
      "humidity": 85,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-16T11:59:49.898Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-16T11:44:49.413Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.5,
      "temperature_apparent": 10.5,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-16T11:29:49.239Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.5,
      "temperature_apparent": 10.5,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T11:14:48.443Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-16T10:59:47.983Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.19,
      "temperature_apparent": 10.19,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-16T10:44:47.459Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-16T10:29:47.187Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-16T10:14:46.409Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-16T09:59:45.921Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-16T09:44:45.379Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.69,
      "temperature_apparent": 9.69,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T09:29:46.058Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-16T09:12:17.305Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-16T08:57:16.966Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-16T08:42:16.265Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.5,
      "temperature_apparent": 9.5,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-16T08:27:16.147Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.5,
      "temperature_apparent": 9.5,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-16T08:12:15.295Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 5.38,
      "datetime": "2024-12-16T07:57:14.923Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.69,
      "temperature_apparent": 9.69,
      "uv_index": 0,
      "wind_speed": 5.63,
      "datetime": "2024-12-16T07:42:14.433Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 5.69,
      "datetime": "2024-12-16T07:27:14.099Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 5.81,
      "datetime": "2024-12-16T07:12:13.432Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 6,
      "datetime": "2024-12-16T06:57:12.901Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 6.13,
      "datetime": "2024-12-16T06:42:12.387Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 6.19,
      "datetime": "2024-12-16T06:27:11.927Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.19,
      "datetime": "2024-12-16T06:12:11.432Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.31,
      "datetime": "2024-12-16T05:57:10.866Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.38,
      "datetime": "2024-12-16T05:42:10.408Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T05:27:09.904Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.63,
      "datetime": "2024-12-16T05:12:09.411Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T04:57:09.044Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T04:42:08.374Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.38,
      "datetime": "2024-12-16T04:27:07.872Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.31,
      "datetime": "2024-12-16T04:12:07.402Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.38,
      "datetime": "2024-12-16T03:57:07.143Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.38,
      "datetime": "2024-12-16T03:42:06.893Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T03:27:06.565Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T03:12:06.291Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T02:57:05.464Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T02:42:04.900Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T02:27:04.488Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T02:12:04.904Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T01:57:03.408Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.31,
      "temperature_apparent": 10.31,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T01:42:02.859Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T01:27:02.410Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T01:12:02.243Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T00:57:01.456Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T00:42:00.897Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.5,
      "temperature_apparent": 10.5,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T00:27:00.473Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.5,
      "temperature_apparent": 10.5,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-16T00:12:00.276Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.5,
      "temperature_apparent": 10.5,
      "uv_index": 0,
      "wind_speed": 6.63,
      "datetime": "2024-12-15T23:56:59.460Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 6.69,
      "datetime": "2024-12-15T23:41:58.926Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 6.69,
      "datetime": "2024-12-15T23:26:58.413Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 6.81,
      "datetime": "2024-12-15T23:11:58.225Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 6.81,
      "datetime": "2024-12-15T22:56:57.427Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 6.88,
      "datetime": "2024-12-15T22:41:57.624Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 6.88,
      "datetime": "2024-12-15T22:26:56.534Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 7,
      "datetime": "2024-12-15T22:11:56.082Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 7,
      "datetime": "2024-12-15T21:56:55.534Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 7,
      "datetime": "2024-12-15T21:41:55.089Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 7.13,
      "datetime": "2024-12-15T21:26:54.558Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 7.13,
      "datetime": "2024-12-15T21:11:55.433Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 6.88,
      "datetime": "2024-12-15T20:54:34.831Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.81,
      "temperature_apparent": 10.81,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-15T20:06:05.333Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.81,
      "temperature_apparent": 10.81,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-15T19:32:50.495Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.81,
      "temperature_apparent": 10.81,
      "uv_index": 0,
      "wind_speed": 6.63,
      "datetime": "2024-12-15T19:16:32.180Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.81,
      "temperature_apparent": 10.81,
      "uv_index": 0,
      "wind_speed": 6.5,
      "datetime": "2024-12-15T19:01:23.026Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 6.38,
      "datetime": "2024-12-15T18:46:02.636Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 6.31,
      "datetime": "2024-12-15T18:30:45.026Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 6.31,
      "datetime": "2024-12-15T18:15:32.600Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 6.31,
      "datetime": "2024-12-15T18:00:02.867Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 6.31,
      "datetime": "2024-12-15T17:44:42.527Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 6.19,
      "datetime": "2024-12-15T17:29:32.566Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 6.19,
      "datetime": "2024-12-15T17:14:22.595Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11,
      "temperature_apparent": 11,
      "uv_index": 0,
      "wind_speed": 6.19,
      "datetime": "2024-12-15T16:59:02.849Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11,
      "temperature_apparent": 11,
      "uv_index": 0,
      "wind_speed": 6.13,
      "datetime": "2024-12-15T16:43:42.536Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.13,
      "temperature_apparent": 11.13,
      "uv_index": 0,
      "wind_speed": 6,
      "datetime": "2024-12-15T16:28:32.534Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.13,
      "temperature_apparent": 11.13,
      "uv_index": 0,
      "wind_speed": 6,
      "datetime": "2024-12-15T16:13:02.655Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.19,
      "temperature_apparent": 11.19,
      "uv_index": 0,
      "wind_speed": 6,
      "datetime": "2024-12-15T15:57:52.887Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.31,
      "temperature_apparent": 11.31,
      "uv_index": 0,
      "wind_speed": 6,
      "datetime": "2024-12-15T15:42:22.599Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 5.88,
      "datetime": "2024-12-15T15:27:02.657Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.5,
      "temperature_apparent": 11.5,
      "uv_index": 0,
      "wind_speed": 5.88,
      "datetime": "2024-12-15T15:11:42.585Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.63,
      "temperature_apparent": 11.63,
      "uv_index": 0,
      "wind_speed": 5.81,
      "datetime": "2024-12-15T14:56:32.940Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.63,
      "temperature_apparent": 11.63,
      "uv_index": 0,
      "wind_speed": 5.63,
      "datetime": "2024-12-15T14:41:12.545Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.69,
      "temperature_apparent": 11.69,
      "uv_index": 0,
      "wind_speed": 5.38,
      "datetime": "2024-12-15T14:26:02.566Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.69,
      "temperature_apparent": 11.69,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T14:10:52.547Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.69,
      "temperature_apparent": 11.69,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T13:55:22.869Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.63,
      "temperature_apparent": 11.63,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T13:40:02.582Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.5,
      "temperature_apparent": 11.5,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T13:24:42.503Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.5,
      "temperature_apparent": 11.5,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T13:09:32.549Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.5,
      "temperature_apparent": 11.5,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-15T12:54:02.644Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.5,
      "temperature_apparent": 11.5,
      "uv_index": 0,
      "wind_speed": 5.13,
      "datetime": "2024-12-15T12:38:42.555Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-15T12:23:02.579Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-15T12:07:52.482Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-15T11:52:42.918Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-15T11:37:32.489Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-15T11:22:22.520Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.38,
      "temperature_apparent": 11.38,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-15T11:07:02.595Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.31,
      "temperature_apparent": 11.31,
      "uv_index": 0,
      "wind_speed": 4.69,
      "datetime": "2024-12-15T10:51:52.906Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11.13,
      "temperature_apparent": 11.13,
      "uv_index": 0,
      "wind_speed": 4.69,
      "datetime": "2024-12-15T10:36:22.579Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 11,
      "temperature_apparent": 11,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T10:21:02.593Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.88,
      "temperature_apparent": 10.88,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T10:05:42.514Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.81,
      "temperature_apparent": 10.81,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T09:50:32.850Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.69,
      "temperature_apparent": 10.69,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T09:35:02.583Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.63,
      "temperature_apparent": 10.63,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T09:19:52.517Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.5,
      "temperature_apparent": 10.5,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T09:04:42.559Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T08:49:12.945Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.38,
      "temperature_apparent": 10.38,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T08:34:02.543Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.19,
      "temperature_apparent": 10.19,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T08:18:42.536Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.19,
      "temperature_apparent": 10.19,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T08:03:32.623Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T07:48:02.748Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10.13,
      "temperature_apparent": 10.13,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T07:32:42.418Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.69,
      "datetime": "2024-12-15T07:17:22.423Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T07:02:12.412Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T06:47:02.721Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T06:31:32.428Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 10,
      "temperature_apparent": 10,
      "uv_index": 0,
      "wind_speed": 3.81,
      "datetime": "2024-12-15T06:16:02.391Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 3.88,
      "datetime": "2024-12-15T06:00:52.428Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-15T05:45:42.737Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.88,
      "temperature_apparent": 9.88,
      "uv_index": 0,
      "wind_speed": 4.13,
      "datetime": "2024-12-15T05:30:12.442Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.19,
      "datetime": "2024-12-15T05:15:02.416Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.38,
      "datetime": "2024-12-15T04:59:42.441Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-15T04:44:32.419Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-15T04:29:02.432Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.69,
      "datetime": "2024-12-15T04:13:52.433Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-15T03:58:42.402Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-15T03:43:12.699Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 4.88,
      "datetime": "2024-12-15T03:28:02.409Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-15T03:12:32.442Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.81,
      "temperature_apparent": 9.81,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-15T02:57:02.404Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.69,
      "temperature_apparent": 9.69,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T02:41:52.457Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.69,
      "temperature_apparent": 9.69,
      "uv_index": 0,
      "wind_speed": 5.38,
      "datetime": "2024-12-15T02:26:42.413Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.69,
      "temperature_apparent": 9.69,
      "uv_index": 0,
      "wind_speed": 5.63,
      "datetime": "2024-12-15T02:11:32.399Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.63,
      "temperature_apparent": 9.63,
      "uv_index": 0,
      "wind_speed": 5.63,
      "datetime": "2024-12-15T01:56:02.434Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.5,
      "temperature_apparent": 9.5,
      "uv_index": 0,
      "wind_speed": 5.69,
      "datetime": "2024-12-15T01:40:52.675Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.38,
      "temperature_apparent": 9.38,
      "uv_index": 0,
      "wind_speed": 5.81,
      "datetime": "2024-12-15T01:25:32.472Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.31,
      "temperature_apparent": 9.31,
      "uv_index": 0,
      "wind_speed": 5.81,
      "datetime": "2024-12-15T01:10:02.384Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.19,
      "temperature_apparent": 9.19,
      "uv_index": 0,
      "wind_speed": 5.69,
      "datetime": "2024-12-15T00:54:52.422Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 9.13,
      "temperature_apparent": 9.13,
      "uv_index": 0,
      "wind_speed": 5.63,
      "datetime": "2024-12-15T00:39:42.855Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.88,
      "temperature_apparent": 8.88,
      "uv_index": 0,
      "wind_speed": 5.5,
      "datetime": "2024-12-15T00:24:02.471Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.81,
      "temperature_apparent": 8.81,
      "uv_index": 0,
      "wind_speed": 5.31,
      "datetime": "2024-12-15T00:08:42.353Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.69,
      "temperature_apparent": 8.69,
      "uv_index": 0,
      "wind_speed": 5.19,
      "datetime": "2024-12-14T23:53:32.446Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.5,
      "temperature_apparent": 8.5,
      "uv_index": 0,
      "wind_speed": 5,
      "datetime": "2024-12-14T23:38:22.564Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.38,
      "temperature_apparent": 8.38,
      "uv_index": 0,
      "wind_speed": 4.81,
      "datetime": "2024-12-14T23:23:02.451Z"
    },
    {
      "humidity": 85,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.19,
      "temperature_apparent": 8.19,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-14T23:07:42.373Z"
    },
    {
      "humidity": 84,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 8.13,
      "temperature_apparent": 8.13,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-14T22:52:32.398Z"
    },
    {
      "humidity": 84,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.88,
      "temperature_apparent": 7.88,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-14T22:37:12.754Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.81,
      "temperature_apparent": 7.81,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-14T22:22:02.626Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.69,
      "temperature_apparent": 7.69,
      "uv_index": 0,
      "wind_speed": 4.63,
      "datetime": "2024-12-14T22:06:32.541Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.5,
      "temperature_apparent": 7.5,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-14T21:51:02.541Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-14T21:35:52.904Z"
    },
    {
      "humidity": 84,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-14T21:20:42.528Z"
    },
    {
      "humidity": 84,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-14T21:05:32.591Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-14T20:50:02.607Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.13,
      "temperature_apparent": 7.13,
      "uv_index": 0,
      "wind_speed": 4.5,
      "datetime": "2024-12-14T20:34:52.896Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 4.38,
      "datetime": "2024-12-14T20:19:22.585Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 4.38,
      "datetime": "2024-12-14T20:04:02.573Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 4.19,
      "datetime": "2024-12-14T19:48:42.532Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 4.19,
      "datetime": "2024-12-14T19:33:32.913Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-14T19:18:12.480Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-14T19:03:02.569Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 4,
      "datetime": "2024-12-14T18:47:42.552Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-14T18:32:22.891Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-14T18:17:02.624Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 3.38,
      "datetime": "2024-12-14T18:01:42.553Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.19,
      "temperature_apparent": 6.19,
      "uv_index": 0,
      "wind_speed": 3.38,
      "datetime": "2024-12-14T17:46:02.559Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.13,
      "temperature_apparent": 6.13,
      "uv_index": 0,
      "wind_speed": 3.31,
      "datetime": "2024-12-14T17:30:42.860Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6,
      "temperature_apparent": 6,
      "uv_index": 0,
      "wind_speed": 3.31,
      "datetime": "2024-12-14T17:15:32.554Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6,
      "temperature_apparent": 6,
      "uv_index": 0,
      "wind_speed": 3.31,
      "datetime": "2024-12-14T17:00:22.673Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6,
      "temperature_apparent": 6,
      "uv_index": 0,
      "wind_speed": 3.19,
      "datetime": "2024-12-14T16:45:02.583Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6,
      "temperature_apparent": 6,
      "uv_index": 0,
      "wind_speed": 3.13,
      "datetime": "2024-12-14T16:29:42.561Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6,
      "temperature_apparent": 6,
      "uv_index": 0,
      "wind_speed": 3.13,
      "datetime": "2024-12-14T16:14:32.621Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 3,
      "datetime": "2024-12-14T15:59:22.520Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T15:44:02.537Z"
    },
    {
      "humidity": 79,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T15:28:52.779Z"
    },
    {
      "humidity": 78,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T15:13:02.580Z"
    },
    {
      "humidity": 78,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T14:57:52.624Z"
    },
    {
      "humidity": 77,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.13,
      "temperature_apparent": 7.13,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T14:42:42.578Z"
    },
    {
      "humidity": 77,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 3,
      "datetime": "2024-12-14T14:27:32.885Z"
    },
    {
      "humidity": 76,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 3.13,
      "datetime": "2024-12-14T14:12:02.563Z"
    },
    {
      "humidity": 76,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 3.19,
      "datetime": "2024-12-14T13:56:52.565Z"
    },
    {
      "humidity": 77,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.31,
      "temperature_apparent": 7.31,
      "uv_index": 0,
      "wind_speed": 3.31,
      "datetime": "2024-12-14T13:41:42.541Z"
    },
    {
      "humidity": 77,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 3.38,
      "datetime": "2024-12-14T13:26:12.926Z"
    },
    {
      "humidity": 77,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 3.5,
      "datetime": "2024-12-14T13:11:02.609Z"
    },
    {
      "humidity": 78,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.13,
      "temperature_apparent": 7.13,
      "uv_index": 0,
      "wind_speed": 3.38,
      "datetime": "2024-12-14T12:55:32.600Z"
    },
    {
      "humidity": 79,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 3.19,
      "datetime": "2024-12-14T12:40:22.510Z"
    },
    {
      "humidity": 80,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 3.13,
      "datetime": "2024-12-14T12:25:02.542Z"
    },
    {
      "humidity": 81,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T12:09:52.534Z"
    },
    {
      "humidity": 82,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T11:54:22.496Z"
    },
    {
      "humidity": 83,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-14T11:39:02.546Z"
    },
    {
      "humidity": 84,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.63,
      "datetime": "2024-12-14T11:23:42.497Z"
    },
    {
      "humidity": 85,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.63,
      "datetime": "2024-12-14T11:08:32.544Z"
    },
    {
      "humidity": 86,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.63,
      "datetime": "2024-12-14T10:53:02.500Z"
    },
    {
      "humidity": 87,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.13,
      "temperature_apparent": 6.13,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-14T10:37:52.537Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.88,
      "temperature_apparent": 5.88,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T10:22:42.895Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.81,
      "temperature_apparent": 5.81,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T10:07:12.575Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.69,
      "temperature_apparent": 5.69,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T09:52:02.614Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.69,
      "temperature_apparent": 5.69,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T09:36:42.545Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T09:21:32.920Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.88,
      "datetime": "2024-12-14T09:06:02.592Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T08:50:52.537Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.63,
      "datetime": "2024-12-14T08:35:42.594Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T08:20:12.876Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-14T08:05:02.534Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T07:49:32.391Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 5,
      "rain_intensity": 0.12,
      "temperature": 5.31,
      "temperature_apparent": 5.31,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T07:34:02.444Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 25,
      "rain_intensity": 0.22,
      "temperature": 5.31,
      "temperature_apparent": 5.31,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T07:18:52.740Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.31,
      "temperature_apparent": 5.31,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T07:03:42.425Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T06:48:12.467Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 4.88,
      "temperature_apparent": 4.88,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T06:33:02.437Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 4.63,
      "temperature_apparent": 4.63,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-14T06:17:42.743Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 4.81,
      "temperature_apparent": 4.81,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-14T06:02:32.417Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5,
      "temperature_apparent": 5,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T05:47:02.439Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-14T05:31:52.369Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-14T05:16:42.872Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T05:01:12.445Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T04:46:02.424Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.69,
      "temperature_apparent": 5.69,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T04:30:32.420Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.81,
      "temperature_apparent": 5.81,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T04:15:22.775Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.81,
      "temperature_apparent": 5.81,
      "uv_index": 0,
      "wind_speed": 2.81,
      "datetime": "2024-12-14T04:00:02.425Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.81,
      "temperature_apparent": 5.81,
      "uv_index": 0,
      "wind_speed": 2.69,
      "datetime": "2024-12-14T03:44:42.350Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.69,
      "temperature_apparent": 5.69,
      "uv_index": 0,
      "wind_speed": 2.63,
      "datetime": "2024-12-14T03:29:32.397Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.69,
      "temperature_apparent": 5.69,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-14T03:14:02.436Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.69,
      "temperature_apparent": 5.69,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-14T02:58:52.400Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-14T02:43:32.409Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.63,
      "temperature_apparent": 5.63,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-14T02:28:02.466Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.88,
      "datetime": "2024-12-14T02:12:52.643Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.88,
      "datetime": "2024-12-14T01:57:42.430Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.88,
      "datetime": "2024-12-14T01:42:12.406Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.81,
      "datetime": "2024-12-14T01:27:02.401Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.81,
      "datetime": "2024-12-14T01:11:42.734Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.81,
      "datetime": "2024-12-14T00:56:22.475Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.69,
      "datetime": "2024-12-14T00:41:02.423Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 1.69,
      "datetime": "2024-12-14T00:25:42.433Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 1.63,
      "datetime": "2024-12-14T00:10:32.914Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 1.63,
      "datetime": "2024-12-13T23:55:12.411Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.31,
      "temperature_apparent": 5.31,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T23:40:02.443Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.19,
      "temperature_apparent": 5.19,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T23:24:32.432Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 1.38,
      "datetime": "2024-12-13T23:09:22.617Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 1.38,
      "datetime": "2024-12-13T22:54:02.425Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T22:38:42.428Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T22:23:32.529Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T22:08:02.881Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.19,
      "temperature_apparent": 5.19,
      "uv_index": 0,
      "wind_speed": 1.31,
      "datetime": "2024-12-13T21:52:52.578Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.31,
      "temperature_apparent": 5.31,
      "uv_index": 0,
      "wind_speed": 1.13,
      "datetime": "2024-12-13T21:37:22.558Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 1,
      "datetime": "2024-12-13T21:22:02.548Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 0.81,
      "datetime": "2024-12-13T21:06:42.739Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.5,
      "temperature_apparent": 5.5,
      "uv_index": 0,
      "wind_speed": 0.69,
      "datetime": "2024-12-13T20:51:32.548Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 0.63,
      "datetime": "2024-12-13T20:36:22.527Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.38,
      "temperature_apparent": 5.38,
      "uv_index": 0,
      "wind_speed": 0.5,
      "datetime": "2024-12-13T20:21:02.534Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.31,
      "temperature_apparent": 5.31,
      "uv_index": 0,
      "wind_speed": 0.38,
      "datetime": "2024-12-13T20:05:42.763Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.19,
      "temperature_apparent": 5.19,
      "uv_index": 0,
      "wind_speed": 0.38,
      "datetime": "2024-12-13T19:50:22.588Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.19,
      "temperature_apparent": 5.19,
      "uv_index": 0,
      "wind_speed": 0.31,
      "datetime": "2024-12-13T19:35:02.667Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5.13,
      "temperature_apparent": 5.13,
      "uv_index": 0,
      "wind_speed": 0.31,
      "datetime": "2024-12-13T19:19:42.596Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5,
      "temperature_apparent": 5,
      "uv_index": 0,
      "wind_speed": 0.19,
      "datetime": "2024-12-13T19:04:32.744Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5,
      "temperature_apparent": 5,
      "uv_index": 0,
      "wind_speed": 0.5,
      "datetime": "2024-12-13T18:49:02.579Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 5,
      "temperature_apparent": 5,
      "uv_index": 0,
      "wind_speed": 0.69,
      "datetime": "2024-12-13T18:33:52.569Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 4.88,
      "temperature_apparent": 4.88,
      "uv_index": 0,
      "wind_speed": 0.81,
      "datetime": "2024-12-13T18:18:22.696Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6,
      "temperature_apparent": 6,
      "uv_index": 0,
      "wind_speed": 0.69,
      "datetime": "2024-12-13T18:03:02.860Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.13,
      "temperature_apparent": 6.13,
      "uv_index": 0,
      "wind_speed": 0.63,
      "datetime": "2024-12-13T17:47:42.533Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.13,
      "temperature_apparent": 6.13,
      "uv_index": 0,
      "wind_speed": 0.5,
      "datetime": "2024-12-13T17:32:32.542Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.19,
      "temperature_apparent": 6.19,
      "uv_index": 0,
      "wind_speed": 0.38,
      "datetime": "2024-12-13T17:17:22.607Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.19,
      "temperature_apparent": 6.19,
      "uv_index": 0,
      "wind_speed": 0.5,
      "datetime": "2024-12-13T17:02:03.058Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.19,
      "temperature_apparent": 6.19,
      "uv_index": 0,
      "wind_speed": 0.5,
      "datetime": "2024-12-13T16:46:52.559Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 0.63,
      "datetime": "2024-12-13T16:31:22.629Z"
    },
    {
      "humidity": 98,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 0.63,
      "datetime": "2024-12-13T16:16:02.593Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 0.81,
      "datetime": "2024-12-13T16:00:42.936Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 0.88,
      "datetime": "2024-12-13T15:45:32.602Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 1.13,
      "datetime": "2024-12-13T15:30:02.601Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 1.19,
      "datetime": "2024-12-13T15:14:52.566Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 1.31,
      "datetime": "2024-12-13T14:59:42.870Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 1.31,
      "datetime": "2024-12-13T14:44:12.459Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1.31,
      "datetime": "2024-12-13T14:29:02.435Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1.38,
      "datetime": "2024-12-13T14:13:32.394Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1.31,
      "datetime": "2024-12-13T13:58:22.848Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1.19,
      "datetime": "2024-12-13T13:43:02.479Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1.13,
      "datetime": "2024-12-13T13:27:52.430Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1,
      "datetime": "2024-12-13T13:12:42.420Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 1,
      "datetime": "2024-12-13T12:57:02.431Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 0.88,
      "datetime": "2024-12-13T12:41:42.420Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 0.88,
      "datetime": "2024-12-13T12:26:12.408Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 0.88,
      "datetime": "2024-12-13T12:11:02.436Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 1,
      "datetime": "2024-12-13T11:55:52.611Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 1.13,
      "datetime": "2024-12-13T11:40:42.390Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 1.31,
      "datetime": "2024-12-13T11:25:12.464Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 1.38,
      "datetime": "2024-12-13T11:10:02.411Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T10:54:42.829Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 1.5,
      "datetime": "2024-12-13T10:39:32.440Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 1.63,
      "datetime": "2024-12-13T10:24:02.539Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 1.69,
      "datetime": "2024-12-13T10:08:52.426Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 1.81,
      "datetime": "2024-12-13T09:53:42.651Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 1.81,
      "datetime": "2024-12-13T09:38:12.509Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 1.88,
      "datetime": "2024-12-13T09:23:02.545Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 1.88,
      "datetime": "2024-12-13T09:07:32.431Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 1.88,
      "datetime": "2024-12-13T08:52:02.641Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T08:36:52.416Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T08:21:42.470Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T08:06:32.406Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T07:51:02.757Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T07:35:42.452Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T07:20:32.437Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T07:05:02.404Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-13T06:49:52.779Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-13T06:34:42.401Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.19,
      "temperature_apparent": 6.19,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T06:19:12.379Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.19,
      "temperature_apparent": 6.19,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T06:04:02.419Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T05:48:52.642Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T05:33:22.459Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T05:18:02.465Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T05:02:42.463Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T04:47:32.741Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T04:32:02.440Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T04:16:52.472Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T04:01:32.436Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T03:46:02.410Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T03:30:52.447Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T03:15:42.445Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2.13,
      "datetime": "2024-12-13T03:00:02.406Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T02:44:42.672Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T02:29:02.448Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T02:13:42.436Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T01:58:32.435Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T01:43:02.804Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2,
      "datetime": "2024-12-13T01:27:52.502Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-12T23:38:07.889Z"
    },
    {
      "humidity": 97,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.19,
      "datetime": "2024-12-12T23:22:57.598Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.31,
      "datetime": "2024-12-12T23:07:47.534Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.31,
      "datetime": "2024-12-12T22:52:17.713Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.31,
      "datetime": "2024-12-12T22:37:07.712Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T22:21:37.565Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T22:06:07.627Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T21:50:57.632Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T21:35:47.975Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T21:20:37.662Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T21:05:07.683Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T20:49:57.623Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T20:34:37.969Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T20:19:07.628Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T20:03:57.602Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T19:48:47.641Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T19:33:17.630Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.38,
      "temperature_apparent": 6.38,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T19:18:07.711Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T19:02:57.757Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T18:47:17.869Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.31,
      "temperature_apparent": 6.31,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T18:32:07.987Z"
    },
    {
      "humidity": 96,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.5,
      "temperature_apparent": 6.5,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T18:16:37.594Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T18:01:07.670Z"
    },
    {
      "humidity": 95,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T17:45:57.583Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.63,
      "temperature_apparent": 6.63,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T17:30:48.043Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T17:15:17.557Z"
    },
    {
      "humidity": 94,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.69,
      "temperature_apparent": 6.69,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T17:00:07.650Z"
    },
    {
      "humidity": 93,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.81,
      "temperature_apparent": 6.81,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T16:44:37.676Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T16:29:27.952Z"
    },
    {
      "humidity": 92,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 6.88,
      "temperature_apparent": 6.88,
      "uv_index": 0,
      "wind_speed": 2.31,
      "datetime": "2024-12-12T16:14:07.602Z"
    },
    {
      "humidity": 91,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7,
      "temperature_apparent": 7,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T15:58:37.572Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.13,
      "temperature_apparent": 7.13,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T15:43:27.619Z"
    },
    {
      "humidity": 90,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.38,
      "datetime": "2024-12-12T15:28:17.943Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T15:13:07.622Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T14:57:37.649Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T14:42:07.619Z"
    },
    {
      "humidity": 89,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T14:26:57.748Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T14:11:47.620Z"
    },
    {
      "humidity": 88,
      "precipitation_probability": 0,
      "rain_intensity": 0,
      "temperature": 7.19,
      "temperature_apparent": 7.19,
      "uv_index": 0,
      "wind_speed": 2.5,
      "datetime": "2024-12-12T13:56:37.651Z"
    }
  ],
  "surf": [
    {
      "spot_name": "South Beach (Tenby)",
      "sub_region": "South Pembrokeshire",
      "duration_hours": "2024-12-20T08:00:00.000Z",
      "timestamp": 2.7,
      "min_wave_size": 1,
      "max_wave_size": 2,
      "swell_period": 10,
      "wind_speed": 13.98857,
      "dawn": "2024-12-20T07:43:18.000Z",
      "sunrise": "2024-12-20T08:23:50.000Z",
      "sunset": "2024-12-20T16:11:45.000Z",
      "dusk": "2024-12-20T16:52:17.000Z",
      "wind_type_Cross-shore": false,
      "wind_type_Offshore": true,
      "wind_type_Onshore": false,
      "rank": 1,
      "weighted_sum": 18.9583333333333,
      "datetime": "2024-12-17T11:00:10.473Z"
    },
    {
      "spot_name": "Highcliffe",
      "sub_region": "Southern England West",
      "duration_hours": "2024-12-21T08:00:00.000Z",
      "timestamp": 2.4,
      "min_wave_size": 2,
      "max_wave_size": 3,
      "swell_period": 7,
      "wind_speed": 15.46283,
      "dawn": "2024-12-21T07:28:20.000Z",
      "sunrise": "2024-12-21T08:07:43.000Z",
      "sunset": "2024-12-21T16:04:53.000Z",
      "dusk": "2024-12-21T16:44:15.000Z",
      "wind_type_Cross-shore": true,
      "wind_type_Offshore": false,
      "wind_type_Onshore": false,
      "rank": 1,
      "weighted_sum": 18,
      "datetime": "2024-12-17T11:00:10.473Z"
    }
  ]
}