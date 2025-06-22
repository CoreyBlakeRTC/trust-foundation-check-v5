// Trust Foundation Check - Consolidated Scoring System
// All-in-one Netlify Function for automated assessment scoring
// Updated: Force fresh deployment with netlify.toml configuration

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    console.log('🎯 Starting consolidated assessment scoring...');
    
    // Parse the incoming form data
    const formData = JSON.parse(event.body);
    console.log('📝 Form data received:', {
      hasPersonalInfo: !!(formData.name || formData.email),
      hasAssessmentData: !!formData.assessmentData,
      dataLength: formData.assessmentData?.length || 0
    });

    // Extract and parse assessment responses
    const assessmentData = parseAssessmentData(formData.assessmentData);
    const personalInfo = {
      name: formData.name || formData['full-name'],
      email: formData.email,
      company: formData.company,
      submissionDate: new Date().toISOString()
    };

    console.log('🔍 Parsed assessment data:', {
      totalQuestions: assessmentData.responses.length,
      questionsAnswered: assessmentData.responses.filter(r => r !== null).length,
      hasQuestionOrder: !!assessmentData.questionOrder
    });

    // Score Trust Challenges
    console.log('⚡ Scoring trust challenges...');
    const challengeResults = scoreTrustChallenges(assessmentData);

    // Score Trust Strengths  
    console.log('💪 Scoring trust strengths...');
    const strengthResults = scoreTrustStrengths(assessmentData);

    // Analyze patterns and relationships
    console.log('🔗 Analyzing patterns...');
    const patternAnalysis = analyzePatterns(challengeResults, strengthResults);

    // Format for VectorShift pipeline
    console.log('📤 Formatting for VectorShift...');
    const vectorShiftPayload = formatForVectorShift({
      personalInfo,
      challengeResults,
      strengthResults,
      patternAnalysis,
      rawData: assessmentData
    });

    // TODO: Send to VectorShift (placeholder for now)
    console.log('🚀 VectorShift payload ready:', {
      participant: vectorShiftPayload.participant.name,
      topChallenges: vectorShiftPayload.trustChallenges.top3.length,
      topStrengths: vectorShiftPayload.trustStrengths.cornerstone.length,
      patternType: vectorShiftPayload.patternAnalysis.combinationKey
    });

    // For now, return the formatted data (later we'll send to VectorShift)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Assessment scored successfully',
        data: vectorShiftPayload
      })
    };

  } catch (error) {
    console.error('❌ Scoring error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

// =============================================================================
// DATA PARSING FUNCTIONS
// =============================================================================

function parseAssessmentData(assessmentDataString) {
  try {
    const lines = assessmentDataString.split('\n');
    const responses = new Array(45).fill(null);
    const questions = new Array(45).fill(null);
    let currentQuestionIndex = -1;

    // Parse each line
    lines.forEach(line => {
      const questionMatch = line.match(/^Q(\d+)(\s*\(R\))?\s*:\s*(.+)$/);
      if (questionMatch) {
        currentQuestionIndex = parseInt(questionMatch[1]) - 1; // Convert to 0-based
        const isReverse = !!questionMatch[2];
        const questionText = questionMatch[3];
        
        questions[currentQuestionIndex] = {
          text: questionText,
          reverseScored: isReverse
        };
      }

      const responseMatch = line.match(/^Response:\s*(\d+)\s*-\s*(.+)$/);
      if (responseMatch && currentQuestionIndex >= 0) {
        const responseValue = parseInt(responseMatch[1]);
        responses[currentQuestionIndex] = responseValue;
      }
    });

    // Create question order based on parsing
    const questionOrder = Array.from({length: 45}, (_, i) => i);

    return {
      responses,
      questions,
      questionOrder
    };

  } catch (error) {
    console.error('Failed to parse assessment data:', error);
    throw new Error('Invalid assessment data format');
  }
}

// =============================================================================
// TRUST CHALLENGES SCORING
// =============================================================================

function scoreTrustChallenges(assessmentData) {
  console.log('🔍 Starting Trust Challenges scoring...');
  
  const { responses, questions } = assessmentData;
  
  // Define the 9 red flags and their question mappings
  const RED_FLAGS = {
    'Inauthenticity': {
      category: 'CONCEAL',
      questionIndices: [0, 1, 2, 3, 4] // Questions 1-5
    },
    'Undercurrent of Negativity': {
      category: 'CONTAMINATE', 
      questionIndices: [5, 6, 7, 8, 9] // Questions 6-10
    },
    'Lack of Follow-Through': {
      category: 'COLLAPSE',
      questionIndices: [10, 11, 12, 13, 14] // Questions 11-15
    },
    'Reluctance to Take on Challenges': {
      category: 'CONCEAL',
      questionIndices: [15, 16, 17, 18, 19] // Questions 16-20
    },
    'Excessive Self-Reliance': {
      category: 'CONTROL',
      questionIndices: [20, 21, 22, 23, 24] // Questions 21-25
    },
    'Micromanaging': {
      category: 'CONTROL',
      questionIndices: [25, 26, 27, 28, 29] // Questions 26-30
    },
    'Emotional Volatility': {
      category: 'CONTAMINATE',
      questionIndices: [30, 31, 32, 33, 34] // Questions 31-35
    },
    'Information Hoarding': {
      category: 'CONTROL',
      questionIndices: [35, 36, 37, 38, 39] // Questions 36-40
    },
    'Closed-Mindedness': {
      category: 'CONCEAL',
      questionIndices: [40, 41, 42, 43, 44] // Questions 41-45
    }
  };

  // Trust Triage Protocol hierarchy
  const TRIAGE_HIERARCHY = {
    'CONTAMINATE': 4, // Highest priority
    'CONTROL': 3,
    'CONCEAL': 2,
    'COLLAPSE': 1 // Lowest priority
  };

  // Within-category hierarchy
  const WITHIN_CATEGORY_HIERARCHY = {
    'CONTAMINATE': {
      'Emotional Volatility': 2,
      'Undercurrent of Negativity': 1
    },
    'CONTROL': {
      'Micromanaging': 3,
      'Information Hoarding': 2,
      'Excessive Self-Reliance': 1
    },
    'CONCEAL': {
      'Inauthenticity': 3,
      'Closed-Mindedness': 2,
      'Reluctance to Take on Challenges': 1
    }
  };

  if (!responses || responses.length !== 45) {
    throw new Error('Invalid assessment data: must have exactly 45 responses');
  }

  // Calculate flag scores
  const flagScores = {};
  const flagDetails = {};

  Object.entries(RED_FLAGS).forEach(([flagName, flagInfo]) => {
    const questionResponses = flagInfo.questionIndices.map(index => {
      const response = responses[index];
      const question = questions[index];
      
      // Apply reverse scoring if needed
      const isReverse = question?.reverseScored || false;
      const scoredValue = isReverse ? (6 - response) : response;
      
      return {
        questionIndex: index,
        originalResponse: response,
        scoredValue: scoredValue,
        isReverse: isReverse
      };
    });

    // Calculate raw total (5-25 range)
    const rawTotal = questionResponses.reduce((sum, q) => sum + q.scoredValue, 0);
    
    // Convert to 0-100 index
    const indexScore = Math.round(((rawTotal - 5) / 20) * 100);
    
    flagScores[flagName] = indexScore;
    flagDetails[flagName] = {
      category: flagInfo.category,
      rawTotal: rawTotal,
      indexScore: indexScore,
      questionResponses: questionResponses,
      severity: categorizeSeverity(indexScore)
    };
  });

  console.log('📊 Flag scores calculated:', Object.entries(flagScores).map(([name, score]) => `${name}: ${score}`));

  // Identify top 3 flags with tie-breaking
  const top3Flags = identifyTop3WithTieBreaking(flagScores, flagDetails, TRIAGE_HIERARCHY, WITHIN_CATEGORY_HIERARCHY);

  // Categorize all flags by severity
  const severityCategories = categorizeAllFlagsBySeverity(flagDetails);

  // Analyze relational density
  const densityAnalysis = analyzeDensity(top3Flags);

  console.log('🏆 Top 3 Trust Challenges:', top3Flags.map(f => `${f.name} (${f.score})`));

  return {
    top3: top3Flags,
    allScores: flagScores,
    flagDetails: flagDetails,
    severityCategories: severityCategories,
    densityPattern: densityAnalysis,
    summary: {
      totalQuestions: 45,
      questionsAnswered: responses.filter(r => r !== null).length,
      averageScore: calculateAverage(Object.values(flagScores)),
      highestScore: Math.max(...Object.values(flagScores)),
      lowestScore: Math.min(...Object.values(flagScores))
    }
  };
}

function identifyTop3WithTieBreaking(flagScores, flagDetails, TRIAGE_HIERARCHY, WITHIN_CATEGORY_HIERARCHY) {
  // Sort all flags by score (highest first)
  const sortedFlags = Object.entries(flagScores)
    .map(([name, score]) => ({
      name,
      score,
      category: flagDetails[name].category,
      details: flagDetails[name]
    }))
    .sort((a, b) => {
      // Primary sort: by score (descending)
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // Tie-breaking: Apply Trust Triage Protocol
      const aCategoryPriority = TRIAGE_HIERARCHY[a.category];
      const bCategoryPriority = TRIAGE_HIERARCHY[b.category];
      
      if (aCategoryPriority !== bCategoryPriority) {
        return bCategoryPriority - aCategoryPriority; // Higher priority wins
      }

      // Within same category, use within-category hierarchy
      const aWithinPriority = WITHIN_CATEGORY_HIERARCHY[a.category]?.[a.name] || 0;
      const bWithinPriority = WITHIN_CATEGORY_HIERARCHY[b.category]?.[b.name] || 0;
      
      return bWithinPriority - aWithinPriority;
    });

  return sortedFlags.slice(0, 3);
}

function categorizeSeverity(score) {
  if (score >= 80) return 'Critical Pressure Points';
  if (score >= 60) return 'Active Friction';
  if (score >= 40) return 'Moderate Tension';
  return 'Background Static';
}

function categorizeAllFlagsBySeverity(flagDetails) {
  const categories = {
    'Critical Pressure Points': [],
    'Active Friction': [],
    'Moderate Tension': [],
    'Background Static': []
  };

  Object.entries(flagDetails).forEach(([name, details]) => {
    categories[details.severity].push({
      name,
      score: details.indexScore,
      category: details.category
    });
  });

  return categories;
}

function analyzeDensity(top3Flags) {
  const categories = top3Flags.map(flag => flag.category);
  const uniqueCategories = [...new Set(categories)];

  if (uniqueCategories.length === 3) {
    return {
      type: 'DISPERSED',
      description: 'Your trust challenges span multiple domains',
      insight: 'Your trust challenges touch multiple aspects of team life, suggesting systemic healing is needed across several dimensions.'
    };
  } else if (uniqueCategories.length === 2) {
    return {
      type: 'CONCENTRATED',
      description: 'A focused wound needs targeted healing',
      insight: 'Your trust challenges cluster in specific areas, allowing for focused intervention strategies.'
    };
  } else {
    const dominantCategory = uniqueCategories[0];
    let insight = '';
    
    switch (dominantCategory) {
      case 'CONTAMINATE':
        insight = 'Emotional wounds dominate your trust landscape, indicating that nervous system healing must come before strategic changes.';
        break;
      case 'CONTROL':
        insight = 'Control has become your team\'s primary trust wound, suggesting that shared ownership and letting go are your most urgent work.';
        break;
      case 'CONCEAL':
        insight = 'Hidden patterns dominate your trust challenges, suggesting that psychological safety and transparency are your primary focus areas.';
        break;
      case 'COLLAPSE':
        insight = 'Follow-through challenges are central to your trust erosion, indicating that reliability and commitment systems need rebuilding.';
        break;
    }

    return {
      type: 'DEEP PATTERN',
      description: 'A profound pattern requires dedicated attention',
      dominantCategory: dominantCategory,
      insight: insight
    };
  }
}

// =============================================================================
// TRUST STRENGTHS SCORING
// =============================================================================

function scoreTrustStrengths(assessmentData) {
  console.log('💪 Starting Trust Strengths scoring...');
  
  const { responses, questions } = assessmentData;
  
  // Define the 9 Trust Foundations (opposite of Red Flags)
  const TRUST_FOUNDATIONS = {
    'Authentic Presence': {
      oppositeOf: 'Inauthenticity',
      questionIndices: [0, 1, 2, 3, 4],
      description: 'The courage to show up genuinely and create space for others to do the same'
    },
    'Constructive Energy': {
      oppositeOf: 'Undercurrent of Negativity',
      questionIndices: [5, 6, 7, 8, 9],
      description: 'The ability to transform challenges into growth opportunities and maintain hope'
    },
    'Reliable Delivery': {
      oppositeOf: 'Lack of Follow-Through',
      questionIndices: [10, 11, 12, 13, 14],
      description: 'Consistent follow-through that builds confidence and momentum'
    },
    'Courageous Growth': {
      oppositeOf: 'Reluctance to Take on Challenges',
      questionIndices: [15, 16, 17, 18, 19],
      description: 'Embracing stretch opportunities and supporting others through uncertainty'
    },
    'Collaborative Power': {
      oppositeOf: 'Excessive Self-Reliance',
      questionIndices: [20, 21, 22, 23, 24],
      description: 'Leveraging collective wisdom and celebrating interdependence'
    },
    'Empowered Autonomy': {
      oppositeOf: 'Micromanaging',
      questionIndices: [25, 26, 27, 28, 29],
      description: 'Trusting others with outcomes while providing support for success'
    },
    'Emotional Wisdom': {
      oppositeOf: 'Emotional Volatility',
      questionIndices: [30, 31, 32, 33, 34],
      description: 'Navigating emotions skillfully to deepen rather than derail relationships'
    },
    'Generous Transparency': {
      oppositeOf: 'Information Hoarding',
      questionIndices: [35, 36, 37, 38, 39],
      description: 'Sharing knowledge and resources freely to multiply collective intelligence'
    },
    'Curious Expansion': {
      oppositeOf: 'Closed-Mindedness',
      questionIndices: [40, 41, 42, 43, 44],
      description: 'Approaching different perspectives with genuine openness and learning orientation'
    }
  };

  // Calculate Foundation Strength using inverted logic
  const foundationScores = {};
  const foundationDetails = {};

  Object.entries(TRUST_FOUNDATIONS).forEach(([foundationName, foundationInfo]) => {
    const questionResponses = foundationInfo.questionIndices.map(index => {
      const response = responses[index];
      const question = questions[index];
      
      // INVERTED LOGIC for strengths:
      // For Reverse-Scored Questions (marked with R): Use RAW response (higher = stronger)
      // For Regular Questions: Invert the score (lower dysfunction = higher strength)
      const isReverse = question?.reverseScored || false;
      const strengthScore = isReverse ? response : (6 - response);
      
      return {
        questionIndex: index,
        originalResponse: response,
        strengthScore: strengthScore,
        isReverse: isReverse
      };
    });

    // Calculate raw total (5-25 range)
    const rawTotal = questionResponses.reduce((sum, q) => sum + q.strengthScore, 0);
    
    // Convert to 0-100 index
    const indexScore = Math.round(((rawTotal - 5) / 20) * 100);
    
    foundationScores[foundationName] = indexScore;
    foundationDetails[foundationName] = {
      indexScore: indexScore,
      rawTotal: rawTotal,
      questionResponses: questionResponses,
      strengthLevel: categorizeStrengthLevel(indexScore),
      description: foundationInfo.description
    };
  });

  console.log('🏗️ Foundation scores calculated:', Object.entries(foundationScores).map(([name, score]) => `${name}: ${score}`));

  // Identify Trust Architecture
  const trustArchitecture = identifyTrustArchitecture(foundationDetails);

  // Pattern Recognition
  const patternAnalysis = analyzeFoundationPatterns(trustArchitecture);

  // Trust Bridges (where strength meets struggle)
  const trustBridges = identifyTrustBridges(foundationDetails);

  console.log('🎯 Trust Architecture:', {
    cornerstone: trustArchitecture.cornerstone.length,
    solid: trustArchitecture.solid.length,
    emerging: trustArchitecture.emerging.length,
    fragile: trustArchitecture.fragile.length
  });

  return {
    allScores: foundationScores,
    foundationDetails: foundationDetails,
    trustArchitecture: trustArchitecture,
    patternAnalysis: patternAnalysis,
    trustBridges: trustBridges,
    summary: {
      totalFoundations: 9,
      averageStrength: calculateAverage(Object.values(foundationScores)),
      strongestFoundation: getStrongestFoundation(foundationDetails),
      trustSignature: trustArchitecture.cornerstone.slice(0, 3) // Top 3 strongest
    }
  };
}

function categorizeStrengthLevel(score) {
  if (score >= 80) return 'Cornerstone';
  if (score >= 60) return 'Solid';
  if (score >= 40) return 'Emerging';
  return 'Fragile';
}

function identifyTrustArchitecture(foundationDetails) {
  const architecture = {
    cornerstone: [], // 80-100: Superpowers
    solid: [],       // 60-79: Reliable patterns
    emerging: [],    // 40-59: Growth potential
    fragile: []      // 0-39: Needs foundational work
  };

  Object.entries(foundationDetails).forEach(([name, details]) => {
    const foundationInfo = {
      name,
      score: details.indexScore,
      description: details.description,
      guidance: getGuidanceForLevel(details.strengthLevel, name)
    };

    switch (details.strengthLevel) {
      case 'Cornerstone':
        architecture.cornerstone.push(foundationInfo);
        break;
      case 'Solid':
        architecture.solid.push(foundationInfo);
        break;
      case 'Emerging':
        architecture.emerging.push(foundationInfo);
        break;
      case 'Fragile':
        architecture.fragile.push(foundationInfo);
        break;
    }
  });

  // Sort each category by score (descending)
  Object.keys(architecture).forEach(key => {
    architecture[key].sort((a, b) => b.score - a.score);
  });

  return architecture;
}

function analyzeFoundationPatterns(architecture) {
  // Identify foundation clusters
  const clusters = {
    presence: 0,    // Authentic + Curious + Courageous
    reliability: 0, // Delivery + Transparency + Autonomy  
    harmony: 0      // Constructive + Emotional + Collaborative
  };

  // Check presence cluster (Learning Culture indicators)
  const presenceFoundations = ['Authentic Presence', 'Curious Expansion', 'Courageous Growth'];
  const reliabilityFoundations = ['Reliable Delivery', 'Generous Transparency', 'Empowered Autonomy'];
  const harmonyFoundations = ['Constructive Energy', 'Emotional Wisdom', 'Collaborative Power'];

  const allFoundations = [...architecture.cornerstone, ...architecture.solid];

  clusters.presence = presenceFoundations.filter(name => 
    allFoundations.some(f => f.name === name)
  ).length;

  clusters.reliability = reliabilityFoundations.filter(name => 
    allFoundations.some(f => f.name === name)
  ).length;

  clusters.harmony = harmonyFoundations.filter(name => 
    allFoundations.some(f => f.name === name)
  ).length;

  // Determine dominant pattern
  let dominantPattern = 'Balanced';
  let patternDescription = 'Your trust strengths are evenly distributed across different dimensions.';

  if (clusters.presence >= 2) {
    dominantPattern = 'Learning Culture';
    patternDescription = 'Your team excels at authenticity, curiosity, and growth - the hallmarks of a learning organization.';
  } else if (clusters.reliability >= 2) {
    dominantPattern = 'Execution Culture';
    patternDescription = 'Your team has strong systems for delivery, transparency, and autonomy - building trust through consistent results.';
  } else if (clusters.harmony >= 2) {
    dominantPattern = 'Relational Culture';
    patternDescription = 'Your team prioritizes emotional connection, positive energy, and collaboration - trust flows through relationships.';
  }

  return {
    clusters,
    dominantPattern,
    patternDescription,
    foundationCount: {
      cornerstone: architecture.cornerstone.length,
      solid: architecture.solid.length,
      emerging: architecture.emerging.length,
      fragile: architecture.fragile.length
    }
  };
}

function identifyTrustBridges(foundationDetails) {
  // Trust bridges are high-strength foundations that can support growth in weaker areas
  const bridges = [];
  
  Object.entries(foundationDetails).forEach(([name, details]) => {
    if (details.strengthLevel === 'Cornerstone' || details.strengthLevel === 'Solid') {
      bridges.push({
        foundation: name,
        score: details.indexScore,
        bridgePotential: getBridgePotential(name, details.indexScore)
      });
    }
  });

  return bridges.sort((a, b) => b.score - a.score);
}

function getGuidanceForLevel(level, foundationName) {
  const guidance = {
    'Cornerstone': `This is a superpower for your team. Leverage ${foundationName} to support growth in other areas.`,
    'Solid': `This is reliable ground to build from. Use ${foundationName} as a bridge to strengthen emerging areas.`,
    'Emerging': `Trust wants to grow here. Nurture ${foundationName} with attention and practice.`,
    'Fragile': `This foundation needs gentle beginning work. Start with small, consistent practices in ${foundationName}.`
  };

  return guidance[level] || 'Continue developing this foundation.';
}

function getBridgePotential(foundationName, score) {
  // Map which foundations can best support others
  const bridgeMap = {
    'Authentic Presence': 'Can create safety for vulnerability and honest feedback',
    'Constructive Energy': 'Can transform challenges into growth opportunities',
    'Reliable Delivery': 'Can build confidence for taking larger risks',
    'Courageous Growth': 'Can inspire others to embrace stretch opportunities',
    'Collaborative Power': 'Can reduce isolation and increase collective intelligence',
    'Empowered Autonomy': 'Can reduce micromanagement while maintaining support',
    'Emotional Wisdom': 'Can create stability for difficult conversations',
    'Generous Transparency': 'Can build trust through open information sharing',
    'Curious Expansion': 'Can create openness to new ideas and approaches'
  };

  return bridgeMap[foundationName] || 'Can support overall trust development';
}

function getStrongestFoundation(foundationDetails) {
  let strongest = { name: '', score: 0 };
  
  Object.entries(foundationDetails).forEach(([name, details]) => {
    if (details.indexScore > strongest.score) {
      strongest = { name, score: details.indexScore };
    }
  });

  return strongest;
}

// =============================================================================
// PATTERN ANALYSIS
// =============================================================================

function analyzePatterns(challengeResults, strengthResults) {
  console.log('🔗 Analyzing patterns between challenges and strengths...');

  // Generate combination key for the top 3 challenges
  const combinationKey = generateCombinationKey(challengeResults.top3);
  
  // Analyze challenge-strength relationships
  const relationships = analyzeRelationships(challengeResults, strengthResults);
  
  // Identify compensating patterns
  const compensationPatterns = identifyCompensationPatterns(challengeResults, strengthResults);
  
  // Assess overall trust landscape
  const trustLandscape = assessTrustLandscape(challengeResults, strengthResults);
  
  // Generate insight summary
  const insights = generateInsights(challengeResults, strengthResults, relationships);

  console.log('🎯 Pattern analysis complete:', {
    combinationKey,
    relationshipCount: relationships.length,
    compensationPatterns: compensationPatterns.length,
    overallBalance: trustLandscape.balance
  });

  return {
    combinationKey,
    relationships,
    compensationPatterns,
    trustLandscape,
    insights,
    metadata: {
      analysisDate: new Date().toISOString(),
      challengeCount: Object.keys(challengeResults.allScores).length,
      strengthCount: Object.keys(strengthResults.allScores).length
    }
  };
}

function generateCombinationKey(top3Challenges) {
  // Create a unique key for the top 3 challenge combination
  const sortedNames = top3Challenges
    .map(challenge => challenge.name.replace(/\s+/g, ''))
    .sort()
    .join('-');
  
  return sortedNames;
}

function analyzeRelationships(challengeResults, strengthResults) {
  const relationships = [];
  
  // Map opposite pairs (challenge -> strength)
  const oppositeMap = {
    'Inauthenticity': 'Authentic Presence',
    'Undercurrent of Negativity': 'Constructive Energy', 
    'Lack of Follow-Through': 'Reliable Delivery',
    'Reluctance to Take on Challenges': 'Courageous Growth',
    'Excessive Self-Reliance': 'Collaborative Power',
    'Micromanaging': 'Empowered Autonomy',
    'Emotional Volatility': 'Emotional Wisdom',
    'Information Hoarding': 'Generous Transparency',
    'Closed-Mindedness': 'Curious Expansion'
  };

  // Analyze each challenge-strength pair
  challengeResults.top3.forEach(challenge => {
    const oppositeStrength = oppositeMap[challenge.name];
    const strengthScore = strengthResults.allScores[oppositeStrength];
    const strengthDetails = strengthResults.foundationDetails[oppositeStrength];
    
    if (strengthScore !== undefined) {
      const relationship = {
        challenge: {
          name: challenge.name,
          score: challenge.score,
          severity: challenge.details?.severity
        },
        strength: {
          name: oppositeStrength,
          score: strengthScore,
          level: strengthDetails?.strengthLevel
        },
        tension: calculateTension(challenge.score, strengthScore),
        insight: generateRelationshipInsight(challenge, oppositeStrength, strengthScore)
      };
      
      relationships.push(relationship);
    }
  });

  return relationships;
}

function identifyCompensationPatterns(challengeResults, strengthResults) {
  const patterns = [];
  
  // Look for high strengths that might be compensating for challenges
  strengthResults.trustArchitecture.cornerstone.forEach(strength => {
    challengeResults.top3.forEach(challenge => {
      // Check if there's a potential compensation dynamic
      const isCompensation = checkCompensationDynamic(strength, challenge);
      
      if (isCompensation) {
        patterns.push({
          type: 'compensation',
          strength: strength.name,
          strengthScore: strength.score,
          challenge: challenge.name,
          challengeScore: challenge.score,
          insight: generateCompensationInsight(strength, challenge)
        });
      }
    });
  });

  return patterns;
}

function assessTrustLandscape(challengeResults, strengthResults) {
  // Calculate overall balance metrics
  const challengeAverage = challengeResults.summary.averageScore;
  const strengthAverage = strengthResults.summary.averageStrength;
  
  // Determine landscape characteristics
  const criticalChallenges = challengeResults.severityCategories['Critical Pressure Points'].length;
  const cornerstoneStrengths = strengthResults.trustArchitecture.cornerstone.length;
  
  let balance = 'Balanced';
  let landscapeType = 'Developing';
  let description = '';

  if (cornerstoneStrengths >= 3 && criticalChallenges === 0) {
    balance = 'Strength-Dominant';
    landscapeType = 'Thriving';
    description = 'Strong foundation with manageable growth areas';
  } else if (criticalChallenges >= 2 && cornerstoneStrengths <= 1) {
    balance = 'Challenge-Heavy';
    landscapeType = 'Struggling';
    description = 'Significant challenges require immediate attention';
  } else if (cornerstoneStrengths >= 2 && criticalChallenges <= 1) {
    balance = 'Stable-Growing';
    landscapeType = 'Healthy';
    description = 'Good foundation with targeted improvement opportunities';
  }

  return {
    balance,
    landscapeType,
    description,
    metrics: {
      challengeAverage,
      strengthAverage,
      balanceRatio: strengthAverage / (challengeAverage || 1),
      criticalChallenges,
      cornerstoneStrengths
    }
  };
}

function generateInsights(challengeResults, strengthResults, relationships) {
  const insights = [];

  // Overall pattern insight
  const densityPattern = challengeResults.densityPattern;
  insights.push({
    type: 'density',
    insight: densityPattern.insight,
    priority: 'high'
  });

  // Strength leverage insights
  if (strengthResults.trustArchitecture.cornerstone.length > 0) {
    const topStrength = strengthResults.trustArchitecture.cornerstone[0];
    insights.push({
      type: 'leverage',
      insight: `Your strongest foundation, ${topStrength.name} (${topStrength.score}), can be leveraged to address your primary challenges.`,
      priority: 'medium'
    });
  }

  // Relationship insights
  relationships.forEach(rel => {
    if (rel.tension === 'high') {
      insights.push({
        type: 'tension',
        insight: `High tension between ${rel.challenge.name} (${rel.challenge.score}) and ${rel.strength.name} (${rel.strength.score}) suggests internal conflict requiring attention.`,
        priority: 'high'
      });
    }
  });

  // Trust landscape insight
  const landscape = assessTrustLandscape(challengeResults, strengthResults);
  insights.push({
    type: 'landscape',
    insight: `Your trust landscape is ${landscape.landscapeType}: ${landscape.description}`,
    priority: 'medium'
  });

  return insights;
}

function calculateTension(challengeScore, strengthScore) {
  const difference = Math.abs(challengeScore - strengthScore);
  
  if (difference >= 40) return 'high';
  if (difference >= 20) return 'medium';
  return 'low';
}

function generateRelationshipInsight(challenge, strengthName, strengthScore) {
  const scoreDiff = strengthScore - challenge.score;
  
  if (scoreDiff > 20) {
    return `Your ${strengthName} (${strengthScore}) provides a strong foundation to address ${challenge.name} (${challenge.score})`;
  } else if (scoreDiff < -20) {
    return `${challenge.name} (${challenge.score}) is overwhelming your ${strengthName} (${strengthScore}) - this requires focused attention`;
  } else {
    return `${challenge.name} and ${strengthName} are in tension (${challenge.score} vs ${strengthScore}) - balanced approach needed`;
  }
}

function checkCompensationDynamic(strength, challenge) {
  // Look for patterns where high strengths might be overcompensating
  const compensationMap = {
    'Empowered Autonomy': ['Micromanaging'],
    'Collaborative Power': ['Excessive Self-Reliance'],
    'Emotional Wisdom': ['Emotional Volatility'],
    'Constructive Energy': ['Undercurrent of Negativity']
  };

  return compensationMap[strength.name]?.includes(challenge.name) && 
         strength.score > 80 && 
         challenge.score > 60;
}

function generateCompensationInsight(strength, challenge) {
  return `Your high ${strength.name} (${strength.score}) may be overcompensating for ${challenge.name} (${challenge.score}), creating internal tension`;
}

// =============================================================================
// VECTORSHIFT FORMATTING
// =============================================================================

function formatForVectorShift(data) {
  const { personalInfo, challengeResults, strengthResults, patternAnalysis, rawData } = data;

  console.log('📤 Formatting data for VectorShift pipeline...');

  // Format participant information
  const participant = {
    name: personalInfo.name,
    email: personalInfo.email,
    company: personalInfo.company,
    submissionDate: personalInfo.submissionDate,
    assessmentVersion: 'v5'
  };

  // Format trust challenges data
  const trustChallenges = {
    top3: challengeResults.top3.map(challenge => ({
      name: challenge.name,
      score: challenge.score,
      severity: challenge.details?.severity || categorizeScore(challenge.score),
      category: challenge.category,
      rank: challengeResults.top3.indexOf(challenge) + 1
    })),
    
    allScores: challengeResults.allScores,
    
    severityBreakdown: {
      critical: challengeResults.severityCategories['Critical Pressure Points']?.length || 0,
      active: challengeResults.severityCategories['Active Friction']?.length || 0,
      moderate: challengeResults.severityCategories['Moderate Tension']?.length || 0,
      background: challengeResults.severityCategories['Background Static']?.length || 0
    },
    
    densityPattern: {
      type: challengeResults.densityPattern.type,
      description: challengeResults.densityPattern.description,
      insight: challengeResults.densityPattern.insight,
      dominantCategory: challengeResults.densityPattern.dominantCategory
    },
    
    summary: challengeResults.summary
  };

  // Format trust strengths data
  const trustStrengths = {
    cornerstone: strengthResults.trustArchitecture.cornerstone.map(foundation => ({
      name: foundation.name,
      score: foundation.score,
      description: foundation.description,
      guidance: foundation.guidance
    })),
    
    solid: strengthResults.trustArchitecture.solid.map(foundation => ({
      name: foundation.name,
      score: foundation.score,
      description: foundation.description,
      guidance: foundation.guidance
    })),
    
    emerging: strengthResults.trustArchitecture.emerging.map(foundation => ({
      name: foundation.name,
      score: foundation.score,
      description: foundation.description,
      guidance: foundation.guidance
    })),
    
    fragile: strengthResults.trustArchitecture.fragile.map(foundation => ({
      name: foundation.name,
      score: foundation.score,
      description: foundation.description,
      guidance: foundation.guidance
    })),
    
    allScores: strengthResults.allScores,
    
    patternAnalysis: strengthResults.patternAnalysis,
    
    trustBridges: strengthResults.trustBridges,
    
    summary: strengthResults.summary
  };

  // Format pattern analysis for narrative selection
  const patternInsights = {
    combinationKey: patternAnalysis.combinationKey,
    
    relationships: patternAnalysis.relationships.map(rel => ({
      challengeName: rel.challenge.name,
      challengeScore: rel.challenge.score,
      strengthName: rel.strength.name,
      strengthScore: rel.strength.score,
      tension: rel.tension,
      insight: rel.insight
    })),
    
    compensationPatterns: patternAnalysis.compensationPatterns,
    
    trustLandscape: {
      balance: patternAnalysis.trustLandscape.balance,
      landscapeType: patternAnalysis.trustLandscape.landscapeType,
      description: patternAnalysis.trustLandscape.description,
      metrics: patternAnalysis.trustLandscape.metrics
    },
    
    keyInsights: patternAnalysis.insights
  };

  // Generate report metadata for VectorShift routing
  const reportMetadata = {
    patternCode: generatePatternCode(challengeResults.top3),
    intensityProfile: determineIntensityProfile(challengeResults),
    narrativeParameters: generateNarrativeParameters(challengeResults, strengthResults),
    recommendationLevel: determineRecommendationLevel(patternAnalysis.trustLandscape),
    customSections: generateCustomSections(challengeResults, strengthResults, patternAnalysis)
  };

  // Compile comprehensive payload for VectorShift
  const vectorShiftPayload = {
    participant,
    trustChallenges,
    trustStrengths,
    patternAnalysis: patternInsights,
    reportMetadata,
    
    // Additional context for AI processing
    processingHints: {
      primaryFocus: determinePrimaryFocus(challengeResults, strengthResults),
      toneGuidance: determineToneGuidance(challengeResults.severityCategories),
      strengthLeverage: identifyStrengthLeverage(strengthResults),
      urgencyLevel: determineUrgencyLevel(challengeResults.severityCategories),
      hopeFactors: identifyHopeFactors(strengthResults.trustArchitecture)
    },
    
    // Raw data backup
    rawAssessmentData: {
      responses: rawData.responses,
      questionOrder: rawData.questionOrder,
      totalQuestions: 45,
      questionsAnswered: rawData.responses.filter(r => r !== null).length
    }
  };

  console.log('✅ VectorShift payload formatted successfully');

  return vectorShiftPayload;
}

// Helper functions for VectorShift formatting

function generatePatternCode(top3Challenges) {
  return top3Challenges
    .map(challenge => {
      const words = challenge.name.split(' ');
      return words.map(word => word.charAt(0)).join('');
    })
    .join('-');
}

function determineIntensityProfile(challengeResults) {
  const criticalCount = challengeResults.severityCategories['Critical Pressure Points']?.length || 0;
  const activeCount = challengeResults.severityCategories['Active Friction']?.length || 0;
  
  if (criticalCount >= 2) return 'CRISIS_MODE';
  if (criticalCount === 1 || activeCount >= 3) return 'ACTIVE_TENSIONS';
  if (activeCount >= 1) return 'EMERGING_CONCERNS';
  return 'EARLY_WARNING';
}

function generateNarrativeParameters(challengeResults, strengthResults) {
  const criticalCount = challengeResults.severityCategories['Critical Pressure Points']?.length || 0;
  const cornerstoneCount = strengthResults.trustArchitecture.cornerstone.length;
  
  return {
    urgency: Math.min(criticalCount / 3, 1), // 0-1 scale
    hopeEmphasis: Math.min(cornerstoneCount / 3, 1), // 0-1 scale
    actionOrientation: criticalCount > 0 ? 0.8 : 0.5,
    strengthLeverage: strengthResults.trustArchitecture.cornerstone.slice(0, 2).map(f => f.name)
  };
}

function determineRecommendationLevel(trustLandscape) {
  switch (trustLandscape.landscapeType) {
    case 'Struggling': return 'INTENSIVE';
    case 'Developing': return 'MODERATE';
    case 'Healthy': return 'MAINTENANCE';
    case 'Thriving': return 'OPTIMIZATION';
    default: return 'MODERATE';
  }
}

function generateCustomSections(challengeResults, strengthResults, patternAnalysis) {
  const densityType = challengeResults.densityPattern.type;
  const strengthPattern = strengthResults.patternAnalysis.dominantPattern;
  
  return {
    openingTone: determineOpeningTone(challengeResults.severityCategories),
    hiddenContribution: mapHiddenContribution(challengeResults.top3),
    transformationPath: mapTransformationPath(densityType, strengthPattern),
    immediateAction: generateImmediateAction(challengeResults.top3[0], strengthResults.trustArchitecture.cornerstone[0])
  };
}

function determinePrimaryFocus(challengeResults, strengthResults) {
  const topChallenge = challengeResults.top3[0];
  const topStrength = strengthResults.trustArchitecture.cornerstone[0];
  
  if (topChallenge.score >= 80) {
    return `Address critical ${topChallenge.name} using ${topStrength?.name || 'available strengths'}`;
  }
  
  return `Leverage ${topStrength?.name || 'strengths'} to prevent escalation of ${topChallenge.name}`;
}

function determineToneGuidance(severityCategories) {
  const criticalCount = severityCategories['Critical Pressure Points']?.length || 0;
  
  if (criticalCount >= 2) return 'compassionate_urgency';
  if (criticalCount === 1) return 'direct_supportive';
  return 'encouraging_growth';
}

function identifyStrengthLeverage(strengthResults) {
  return strengthResults.trustArchitecture.cornerstone
    .slice(0, 2)
    .map(foundation => ({
      name: foundation.name,
      score: foundation.score,
      leveragePoint: foundation.guidance
    }));
}

function determineUrgencyLevel(severityCategories) {
  const criticalCount = severityCategories['Critical Pressure Points']?.length || 0;
  const activeCount = severityCategories['Active Friction']?.length || 0;
  
  if (criticalCount >= 2) return 'immediate';
  if (criticalCount === 1 || activeCount >= 3) return 'high';
  if (activeCount >= 1) return 'moderate';
  return 'low';
}

function identifyHopeFactors(trustArchitecture) {
  return {
    cornerstoneCount: trustArchitecture.cornerstone.length,
    solidCount: trustArchitecture.solid.length,
    strongestFoundation: trustArchitecture.cornerstone[0]?.name,
    growthPotential: trustArchitecture.emerging.length
  };
}

function categorizeScore(score) {
  if (score >= 80) return 'Critical Pressure Points';
  if (score >= 60) return 'Active Friction';
  if (score >= 40) return 'Moderate Tension';
  return 'Background Static';
}

function determineOpeningTone(severityCategories) {
  const criticalCount = severityCategories['Critical Pressure Points']?.length || 0;
  
  if (criticalCount >= 2) return 'gentle_urgent';
  if (criticalCount === 1) return 'direct_compassionate';
  return 'appreciative_growth';
}

function mapHiddenContribution(top3Challenges) {
  // Map most common leadership contribution patterns
  const contributionMap = {
    'Emotional Volatility': 'emotional_regulation_modeling',
    'Micromanaging': 'trust_and_delegate',
    'Inauthenticity': 'vulnerability_and_presence',
    'Information Hoarding': 'transparency_and_sharing',
    'Closed-Mindedness': 'curiosity_and_openness'
  };
  
  return contributionMap[top3Challenges[0].name] || 'leadership_awareness_pattern';
}

function mapTransformationPath(densityType, strengthPattern) {
  if (densityType === 'DEEP PATTERN') return 'focused_category_healing';
  if (densityType === 'CONCENTRATED') return 'targeted_dual_approach';
  return 'systemic_multi_dimensional';
}

function generateImmediateAction(topChallenge, topStrength) {
  const actionMap = {
    'Emotional Volatility': 'daily_emotional_check_ins',
    'Micromanaging': 'weekly_delegation_practice',
    'Inauthenticity': 'vulnerability_practice',
    'Information Hoarding': 'transparent_communication_habit',
    'Undercurrent of Negativity': 'gratitude_and_wins_focus'
  };
  
  return actionMap[topChallenge.name] || 'trust_building_conversation';
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function calculateAverage(scores) {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}