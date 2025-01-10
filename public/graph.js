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
      [0.5, 'rgb(63, 67, 77)'],      // Dark grey for low values
      [0.8, 'rgb(50, 120, 200)'], // Intermediate blue
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
